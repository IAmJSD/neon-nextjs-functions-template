import { randomBytes, timingSafeEqual, webcrypto } from "node:crypto";
import { Hono } from "hono";
import pool from "database/pool";
import { mcpOAuthAuthorizationCodes, mcpOAuthClients } from "database/schema";
import { and, eq, gt, isNull, type InferSelectModel } from "drizzle-orm";
import {
    oauthAuthorizationUrl,
    oauthIssuerUrl,
    oauthRegistrationUrl,
    oauthSignInUrl,
    oauthTokenUrl,
    resourceName,
    resourceServerUrl,
    scopesSupported,
    serviceDocumentationUrl,
    webAuthorizationUrl,
} from "./authConfig";
import { authenticateJwt, type McpAuthInfo } from "./authenticate";

type OAuthClient = InferSelectModel<typeof mcpOAuthClients>;

type AuthorizationRequest = {
    client: OAuthClient;
    redirectUri: string;
    codeChallenge: string;
    scope: string | null;
    state: string | null;
    resource: string | null;
};

type ParsedBody = URLSearchParams;

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const CLIENT_SECRET_TTL_SECONDS = 30 * 24 * 60 * 60;
const SUPPORTED_GRANT_TYPES = ["authorization_code"] as const;
const REGISTRATION_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
const WEB_SESSION_TOKEN_HEADER = "x-mcp-web-session-token";
const OAUTH_PARAMS = [
    "client_id",
    "redirect_uri",
    "response_type",
    "code_challenge",
    "code_challenge_method",
    "scope",
    "state",
    "resource",
] as const;

function oauthError(error: string, description: string, status = 400) {
    return Response.json({
        error,
        error_description: description,
    }, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
    });
}

function redirectWithError(redirectUri: string, error: string, description: string, state: string | null) {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) {
        url.searchParams.set("state", state);
    }
    return Response.redirect(url.href);
}

function redirectWithCode(redirectUri: string, code: string, state: string | null) {
    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (state) {
        url.searchParams.set("state", state);
    }
    return Response.redirect(url.href);
}

function safeUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol !== "javascript:" ? url : null;
    } catch {
        return null;
    }
}

function withoutHash(value: string) {
    const url = new URL(value);
    url.hash = "";
    return url.href;
}

function isLoopbackRedirectAllowed(redirectUri: string, registeredUris: string[]) {
    const requested = safeUrl(redirectUri);
    if (!requested || !["localhost", "127.0.0.1", "[::1]"].includes(requested.hostname)) {
        return false;
    }

    return registeredUris.some((registeredUri) => {
        const registered = safeUrl(registeredUri);
        return Boolean(registered
            && registered.protocol === requested.protocol
            && registered.hostname === requested.hostname
            && registered.pathname === requested.pathname
            && registered.search === requested.search);
    });
}

function redirectUriAllowed(redirectUri: string, registeredUris: string[]) {
    return registeredUris.includes(redirectUri) || isLoopbackRedirectAllowed(redirectUri, registeredUris);
}

function requestedScopesAllowed(scope: string | null, clientScope: string | null) {
    if (!scope || !clientScope) {
        return true;
    }

    const allowed = new Set(clientScope.split(/\s+/).filter(Boolean));
    return scope.split(/\s+/).filter(Boolean).every((value) => allowed.has(value));
}

function requestedGrantTypesAllowed(grantTypes: string[]) {
    const supported = new Set<string>(REGISTRATION_GRANT_TYPES);
    return grantTypes.includes("authorization_code") && grantTypes.every((grantType) => supported.has(grantType));
}

function randomToken(prefix: string) {
    return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

async function requestBody(request: Request): Promise<ParsedBody> {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        const body = await request.json() as Record<string, unknown>;
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    params.append(key, String(item));
                }
            } else if (value !== undefined && value !== null) {
                params.set(key, String(value));
            }
        }
        return params;
    }

    return new URLSearchParams(await request.text());
}

function paramsFromRequest(request: Request, body?: ParsedBody) {
    return request.method === "GET" ? new URL(request.url).searchParams : body ?? new URLSearchParams();
}

function sessionTokenFromCookie(request: Request) {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) {
        return null;
    }

    for (const part of cookieHeader.split(";")) {
        const [rawName, ...rawValue] = part.trim().split("=");
        if (rawName.includes("session_token") && rawValue.length > 0) {
            const value = rawValue.join("=");
            try {
                return decodeURIComponent(value);
            } catch {
                return value;
            }
        }
    }

    return null;
}

async function authFromSessionCookie(request: Request) {
    const webSessionToken = request.headers.get(WEB_SESSION_TOKEN_HEADER);
    if (webSessionToken) {
        return authenticateJwt(webSessionToken, false);
    }

    const token = sessionTokenFromCookie(request);
    return token ? authenticateJwt(token, false) : { success: false as const, error: "Session is required" };
}

async function parseAuthorizationRequest(request: Request, params: URLSearchParams) {
    const clientId = params.get("client_id");
    if (!clientId) {
        return { success: false as const, response: oauthError("invalid_request", "client_id is required") };
    }

    const [client] = await pool.select().from(mcpOAuthClients).where(eq(mcpOAuthClients.clientId, clientId)).limit(1);
    if (!client) {
        return { success: false as const, response: oauthError("invalid_client", "Invalid client_id") };
    }

    const state = params.get("state");
    const requestedRedirectUri = params.get("redirect_uri");
    const redirectUri = requestedRedirectUri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
    if (!redirectUri || !redirectUriAllowed(redirectUri, client.redirectUris)) {
        return { success: false as const, response: oauthError("invalid_request", "Invalid redirect_uri") };
    }

    if (params.get("response_type") !== "code") {
        return { success: false as const, response: redirectWithError(redirectUri, "unsupported_response_type", "Only response_type=code is supported", state) };
    }

    const codeChallenge = params.get("code_challenge");
    if (!codeChallenge) {
        return { success: false as const, response: redirectWithError(redirectUri, "invalid_request", "code_challenge is required", state) };
    }

    if (params.get("code_challenge_method") !== "S256") {
        return { success: false as const, response: redirectWithError(redirectUri, "invalid_request", "code_challenge_method must be S256", state) };
    }

    const scope = params.get("scope");
    if (!requestedScopesAllowed(scope, client.scope)) {
        return { success: false as const, response: redirectWithError(redirectUri, "invalid_scope", "Requested scope is not allowed for this client", state) };
    }

    const resource = params.get("resource");
    if (resource) {
        const resourceUrl = safeUrl(resource);
        if (!resourceUrl || withoutHash(resourceUrl.href) !== withoutHash(resourceServerUrl(request).href)) {
            return { success: false as const, response: redirectWithError(redirectUri, "invalid_target", "Invalid resource", state) };
        }
    }

    return {
        success: true as const,
        authorizationRequest: {
            client,
            redirectUri,
            codeChallenge,
            scope,
            state,
            resource,
        } satisfies AuthorizationRequest,
    };
}

async function createAuthorizationCode(authorizationRequest: AuthorizationRequest, authInfo: McpAuthInfo) {
    const code = randomToken("mcp_code");
    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);

    await pool.insert(mcpOAuthAuthorizationCodes).values({
        code,
        clientId: authorizationRequest.client.clientId,
        redirectUri: authorizationRequest.redirectUri,
        codeChallenge: authorizationRequest.codeChallenge,
        codeChallengeMethod: "S256",
        scope: authorizationRequest.scope,
        resource: authorizationRequest.resource,
        userId: authInfo.extra.user.id,
        accessToken: authInfo.token,
        expiresAt,
    });

    return code;
}

async function completeAuthorization(authorizationRequest: AuthorizationRequest, authInfo: McpAuthInfo) {
    const code = await createAuthorizationCode(authorizationRequest, authInfo);
    return redirectWithCode(authorizationRequest.redirectUri, code, authorizationRequest.state);
}

function withOAuthParams(url: URL, params: URLSearchParams) {
    for (const name of OAUTH_PARAMS) {
        for (const value of params.getAll(name)) {
            url.searchParams.append(name, value);
        }
    }

    return url;
}

function authorizationUrlWithParams(request: Request, params: URLSearchParams) {
    return withOAuthParams(new URL(oauthAuthorizationUrl(request)), params);
}

function sameEndpoint(a: URL, b: URL) {
    const aPath = a.pathname.replace(/\/+$/, "") || "/";
    const bPath = b.pathname.replace(/\/+$/, "") || "/";
    return a.origin === b.origin && aPath === bPath;
}

function htmlEscape(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function browserRedirect(url: URL) {
    const href = htmlEscape(url.href);

    return new Response(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0;url=${href}">
    <title>Continue OAuth</title>
    <script>location.replace(${JSON.stringify(url.href)});</script>
  </head>
  <body>
    <a href="${href}">Continue OAuth</a>
  </body>
</html>`, {
        status: 200,
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

function redirectToExternalAuthorization(request: Request, params: URLSearchParams) {
    const targetUrl = webAuthorizationUrl();
    if (!targetUrl) {
        return null;
    }

    const currentUrl = new URL(request.url);
    const authorizationUrl = withOAuthParams(targetUrl, params);

    if (sameEndpoint(currentUrl, authorizationUrl)) {
        return null;
    }

    return browserRedirect(authorizationUrl);
}

function redirectToWebSignIn(request: Request, params: URLSearchParams) {
    const signInUrl = oauthSignInUrl(request);
    const returnUrl = authorizationUrlWithParams(request, params);
    const redirectTo = signInUrl.origin === returnUrl.origin
        ? `${returnUrl.pathname}${returnUrl.search}`
        : returnUrl.href;

    signInUrl.searchParams.set("redirectTo", redirectTo);
    return Response.redirect(signInUrl.href, 303);
}

function normalizeMetadataArray(value: unknown, fallback: string[]) {
    if (value === undefined) {
        return fallback;
    }

    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function normalizeAuthMethod(value: unknown) {
    if (value === undefined || value === null) {
        return "none";
    }

    return value === "none" || value === "client_secret_post" || value === "client_secret_basic"
        ? value
        : null;
}

function clientResponse(client: OAuthClient) {
    return {
        client_id: client.clientId,
        client_secret: client.clientSecret ?? undefined,
        client_id_issued_at: client.clientIdIssuedAt,
        client_secret_expires_at: client.clientSecretExpiresAt ?? undefined,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        client_name: client.clientName ?? undefined,
        scope: client.scope ?? undefined,
    };
}

function basicAuthClientCredentials(request: Request) {
    const authorization = request.headers.get("authorization");
    if (!authorization?.toLowerCase().startsWith("basic ")) {
        return null;
    }

    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) {
        return null;
    }

    return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
}

async function authenticateClient(request: Request, params: URLSearchParams) {
    const basicCredentials = basicAuthClientCredentials(request);
    const clientId = basicCredentials?.clientId ?? params.get("client_id");
    if (!clientId) {
        return { success: false as const, response: oauthError("invalid_client", "client_id is required", 401) };
    }

    const [client] = await pool.select().from(mcpOAuthClients).where(eq(mcpOAuthClients.clientId, clientId)).limit(1);
    if (!client) {
        return { success: false as const, response: oauthError("invalid_client", "Invalid client_id", 401) };
    }

    if (client.tokenEndpointAuthMethod !== "none") {
        const clientSecret = basicCredentials?.clientSecret ?? params.get("client_secret");
        if (!client.clientSecret || !clientSecret) {
            return { success: false as const, response: oauthError("invalid_client", "client_secret is required", 401) };
        }

        const expected = Buffer.from(client.clientSecret);
        const received = Buffer.from(clientSecret);
        if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
            return { success: false as const, response: oauthError("invalid_client", "Invalid client_secret", 401) };
        }

        if (client.clientSecretExpiresAt && client.clientSecretExpiresAt < Math.floor(Date.now() / 1000)) {
            return { success: false as const, response: oauthError("invalid_client", "client_secret has expired", 401) };
        }
    }

    return { success: true as const, client };
}

async function verifyPkce(codeVerifier: string, codeChallenge: string) {
    const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    return Buffer.from(digest).toString("base64url") === codeChallenge;
}

function tokenExpiresIn(authInfo: McpAuthInfo) {
    if (!authInfo.expiresAt) {
        return undefined;
    }

    return Math.max(0, authInfo.expiresAt - Math.floor(Date.now() / 1000));
}

const oauthRouter = new Hono();

oauthRouter.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (c.req.method === "OPTIONS") {
        return c.body(null, 204);
    }

    await next();
});

oauthRouter.get("/.well-known/oauth-protected-resource", (c) => {
    const request = c.req.raw;
    return c.json({
        resource: resourceServerUrl(request).href,
        authorization_servers: [oauthIssuerUrl(request).href],
        scopes_supported: scopesSupported,
        resource_name: resourceName,
        resource_documentation: serviceDocumentationUrl?.href,
    });
});

oauthRouter.get("/.well-known/oauth-protected-resource/*", (c) => {
    const request = c.req.raw;
    return c.json({
        resource: resourceServerUrl(request).href,
        authorization_servers: [oauthIssuerUrl(request).href],
        scopes_supported: scopesSupported,
        resource_name: resourceName,
        resource_documentation: serviceDocumentationUrl?.href,
    });
});

oauthRouter.get("/.well-known/oauth-authorization-server", (c) => {
    const request = c.req.raw;
    return c.json({
        issuer: oauthIssuerUrl(request).href,
        authorization_endpoint: oauthAuthorizationUrl(request),
        token_endpoint: oauthTokenUrl(request),
        registration_endpoint: oauthRegistrationUrl(request),
        response_types_supported: ["code"],
        grant_types_supported: SUPPORTED_GRANT_TYPES,
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
        scopes_supported: scopesSupported,
        service_documentation: serviceDocumentationUrl?.href,
    });
});

oauthRouter.get("/.well-known/oauth-authorization-server/*", (c) => {
    const request = c.req.raw;
    return c.json({
        issuer: oauthIssuerUrl(request).href,
        authorization_endpoint: oauthAuthorizationUrl(request),
        token_endpoint: oauthTokenUrl(request),
        registration_endpoint: oauthRegistrationUrl(request),
        response_types_supported: ["code"],
        grant_types_supported: SUPPORTED_GRANT_TYPES,
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
        scopes_supported: scopesSupported,
        service_documentation: serviceDocumentationUrl?.href,
    });
});

oauthRouter.post("/register", async (c) => {
    let body: Record<string, unknown>;
    try {
        body = await c.req.json() as Record<string, unknown>;
    } catch {
        return oauthError("invalid_client_metadata", "Registration request must be JSON");
    }

    const redirectUris = normalizeMetadataArray(body.redirect_uris, []);
    if (!redirectUris || redirectUris.length === 0 || redirectUris.some((uri) => !safeUrl(uri))) {
        return oauthError("invalid_redirect_uri", "redirect_uris must contain at least one valid URL");
    }

    const tokenEndpointAuthMethod = normalizeAuthMethod(body.token_endpoint_auth_method);
    if (!tokenEndpointAuthMethod) {
        return oauthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method");
    }

    const grantTypes = normalizeMetadataArray(body.grant_types, ["authorization_code"]);
    if (!grantTypes || !requestedGrantTypesAllowed(grantTypes)) {
        return oauthError("invalid_client_metadata", "authorization_code grant is required; refresh_token may also be requested");
    }
    const registeredGrantTypes = grantTypes.filter((grantType) => grantType === "authorization_code");

    const responseTypes = normalizeMetadataArray(body.response_types, ["code"]);
    if (!responseTypes || responseTypes.some((responseType) => responseType !== "code")) {
        return oauthError("invalid_client_metadata", "Only code response type is supported");
    }

    const clientIdIssuedAt = Math.floor(Date.now() / 1000);
    const clientSecret = tokenEndpointAuthMethod === "none" ? null : randomToken("mcp_secret");
    const clientSecretExpiresAt = clientSecret ? clientIdIssuedAt + CLIENT_SECRET_TTL_SECONDS : null;
    const [client] = await pool.insert(mcpOAuthClients).values({
        clientId: randomToken("mcp_client"),
        clientSecret,
        clientIdIssuedAt,
        clientSecretExpiresAt,
        redirectUris,
        tokenEndpointAuthMethod,
        grantTypes: registeredGrantTypes,
        responseTypes,
        clientName: typeof body.client_name === "string" ? body.client_name : null,
        scope: typeof body.scope === "string" ? body.scope : null,
    }).returning();

    return c.json(clientResponse(client), 201);
});

oauthRouter.on(["GET", "POST"], "/authorize", async (c) => {
    const body = c.req.method === "POST" ? await requestBody(c.req.raw) : undefined;
    const params = paramsFromRequest(c.req.raw, body);
    const parsed = await parseAuthorizationRequest(c.req.raw, params);

    if (!parsed.success) {
        return parsed.response;
    }

    const cookieAuth = await authFromSessionCookie(c.req.raw);
    if (cookieAuth.success) {
        return completeAuthorization(parsed.authorizationRequest, cookieAuth.authInfo);
    }

    const externalAuthorization = redirectToExternalAuthorization(c.req.raw, params);
    if (externalAuthorization) {
        return externalAuthorization;
    }

    return redirectToWebSignIn(c.req.raw, params);
});

oauthRouter.post("/token", async (c) => {
    const params = await requestBody(c.req.raw);
    if (params.get("grant_type") !== "authorization_code") {
        return oauthError("unsupported_grant_type", "Only authorization_code grant is supported");
    }

    const clientAuth = await authenticateClient(c.req.raw, params);
    if (!clientAuth.success) {
        return clientAuth.response;
    }

    const code = params.get("code");
    const codeVerifier = params.get("code_verifier");
    if (!code || !codeVerifier) {
        return oauthError("invalid_request", "code and code_verifier are required");
    }

    const [authorizationCode] = await pool.select()
        .from(mcpOAuthAuthorizationCodes)
        .where(and(
            eq(mcpOAuthAuthorizationCodes.code, code),
            eq(mcpOAuthAuthorizationCodes.clientId, clientAuth.client.clientId),
            isNull(mcpOAuthAuthorizationCodes.consumedAt),
            gt(mcpOAuthAuthorizationCodes.expiresAt, new Date()),
        ))
        .limit(1);

    if (!authorizationCode) {
        return oauthError("invalid_grant", "Invalid authorization code");
    }

    const redirectUri = params.get("redirect_uri");
    if (redirectUri && redirectUri !== authorizationCode.redirectUri) {
        return oauthError("invalid_grant", "redirect_uri does not match the authorization request");
    }

    if (!await verifyPkce(codeVerifier, authorizationCode.codeChallenge)) {
        return oauthError("invalid_grant", "Invalid code_verifier");
    }

    const auth = await authenticateJwt(authorizationCode.accessToken, false);
    if (!auth.success) {
        return oauthError("invalid_grant", "Authorization code token is no longer valid");
    }

    const [consumedCode] = await pool.update(mcpOAuthAuthorizationCodes).set({
        consumedAt: new Date(),
    }).where(and(
        eq(mcpOAuthAuthorizationCodes.code, authorizationCode.code),
        isNull(mcpOAuthAuthorizationCodes.consumedAt),
    )).returning({ code: mcpOAuthAuthorizationCodes.code });

    if (!consumedCode) {
        return oauthError("invalid_grant", "Authorization code has already been used");
    }

    return c.json({
        access_token: authorizationCode.accessToken,
        token_type: "Bearer",
        expires_in: tokenExpiresIn(auth.authInfo),
        scope: authorizationCode.scope ?? undefined,
    });
});

export default oauthRouter;
