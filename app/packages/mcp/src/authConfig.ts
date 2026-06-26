function mustEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Environment variable ${name} is not set`);
    }
    return value;
}

function optionalUrl(name: string): URL | undefined {
    const value = process.env[name];
    return value ? new URL(value) : undefined;
}

function scopesFromEnv(): string[] | undefined {
    const scopes = process.env.MCP_OAUTH_SCOPES?.split(/[,\s]+/).filter(Boolean);
    return scopes && scopes.length > 0 ? scopes : undefined;
}

function requestOrigin(request: Request): string {
    const requestUrl = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = request.headers.get("host")?.split(",")[0]?.trim();

    if (forwardedHost) {
        return `${forwardedProto || requestUrl.protocol.replace(":", "")}://${forwardedHost}`;
    }

    if (host) {
        return `${forwardedProto || requestUrl.protocol.replace(":", "")}://${host}`;
    }

    return requestUrl.origin;
}

function originUrl(request: Request) {
    return new URL(requestOrigin(request));
}

function oauthBaseUrl(request: Request): URL {
    const value = process.env.MCP_OAUTH_ISSUER
        ?? process.env.MCP_RESOURCE_SERVER_URL
        ?? new URL(defaultOAuthBasePath(request), originUrl(request)).href;
    const url = new URL(value);
    if (!url.pathname.endsWith("/")) {
        url.pathname = `${url.pathname}/`;
    }
    return url;
}

function defaultOAuthBasePath(request: Request): string {
    const { pathname } = new URL(request.url);

    if (pathname === "/" || pathname.startsWith("/.well-known/") || pathname === "/authorize" || pathname === "/token" || pathname === "/register") {
        return "/";
    }

    return "/mcp/";
}

function defaultResourceServerPath(request: Request): string {
    return defaultOAuthBasePath(request) === "/" ? "/" : "/mcp";
}

export const neonAuthBaseUrl = mustEnv("NEON_AUTH_BASE_URL").replace(/\/+$/, "");
export const resourceName = process.env.MCP_RESOURCE_NAME ?? "Neon MCP Server";
export const serviceDocumentationUrl = optionalUrl("MCP_SERVICE_DOCUMENTATION_URL");
export const scopesSupported = scopesFromEnv();

export function oauthIssuerUrl(request: Request): URL {
    const url = oauthBaseUrl(request);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url;
}

export function resourceServerUrl(request: Request): URL {
    return new URL(process.env.MCP_RESOURCE_SERVER_URL ?? new URL(defaultResourceServerPath(request), originUrl(request)).href);
}

export function resourceMetadataUrl(request: Request): string {
    return new URL(".well-known/oauth-protected-resource", oauthBaseUrl(request)).href;
}

export function oauthMetadataUrl(request: Request): string {
    return new URL(".well-known/oauth-authorization-server", oauthBaseUrl(request)).href;
}

export function oauthAuthorizationUrl(request: Request): string {
    const explicitAuthorizationUrl = process.env.MCP_OAUTH_AUTHORIZATION_URL;
    if (explicitAuthorizationUrl) {
        return new URL(explicitAuthorizationUrl).href;
    }

    const webAuthorization = webAuthorizationUrl();
    if (webAuthorization) {
        return webAuthorization.href;
    }

    return new URL("authorize", oauthBaseUrl(request)).href;
}

export function webAuthorizationUrl(): URL | null {
    const explicitAuthorizationUrl = process.env.MCP_WEB_AUTHORIZATION_URL;
    if (explicitAuthorizationUrl) {
        return new URL(explicitAuthorizationUrl);
    }

    const webOrigin = process.env.MCP_WEB_ORIGIN;
    return webOrigin ? new URL("/mcp/authorize", webOrigin) : null;
}

export function oauthTokenUrl(request: Request): string {
    return new URL("token", oauthBaseUrl(request)).href;
}

export function oauthRegistrationUrl(request: Request): string {
    return new URL("register", oauthBaseUrl(request)).href;
}

export function oauthSignInUrl(request: Request): URL {
    return new URL(process.env.MCP_OAUTH_SIGN_IN_URL ?? "/auth/sign-in", originUrl(request));
}
