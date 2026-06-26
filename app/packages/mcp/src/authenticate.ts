import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import pool from "database/pool";
import { eq, type InferSelectModel } from "drizzle-orm";
import { users } from "drizzle-orm/neon";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

type User = InferSelectModel<typeof users>;

export type McpAuthInfo = AuthInfo & {
    extra: {
        tokenType: "oauth-jwt";
        user: User;
    };
};

type AuthResponse = {
    success: false;
    error: string;
} | {
    success: true;
    authInfo: McpAuthInfo;
};

type ParsedAuthorizationHeader = {
    success: false;
    error: string;
} | {
    success: true;
    type: string;
    token: string;
};

function mustEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Environment variable ${name} is not set`);
    }
    return value;
}

const neonAuthJwksUrl = mustEnv("NEON_AUTH_JWKS_URL");
const neonAuthBaseUrl = mustEnv("NEON_AUTH_BASE_URL");

const jwks = createRemoteJWKSet(new URL(neonAuthJwksUrl));
const normalizedIssuer = neonAuthBaseUrl.replace(/\/+$/, "");
const issuer = [normalizedIssuer, new URL(normalizedIssuer).origin];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseAuthorizationHeader(request: Request): ParsedAuthorizationHeader {
    const authorizationHeader = request.headers.get("Authorization");
    if (!authorizationHeader) {
        return { success: false, error: "Authorization header is required" };
    }

    const parts = authorizationHeader.split(" ");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { success: false, error: "Invalid authorization header" };
    }

    return {
        success: true,
        type: parts[0].toLowerCase(),
        token: parts[1],
    };
}

function stringClaim(payload: JWTPayload, name: string): string | undefined {
    const value = payload[name];
    return typeof value === "string" ? value : undefined;
}

function scopesFromPayload(payload: JWTPayload): string[] {
    const scope = payload.scope;
    if (typeof scope === "string") {
        return scope.split(/\s+/).filter(Boolean);
    }

    const scp = payload.scp;
    if (Array.isArray(scp)) {
        return scp.filter((value): value is string => typeof value === "string");
    }

    return [];
}

function clientIdFromPayload(payload: JWTPayload): string {
    const clientId = stringClaim(payload, "client_id") ?? stringClaim(payload, "azp");
    if (clientId) {
        return clientId;
    }

    if (typeof payload.aud === "string") {
        return payload.aud;
    }

    if (Array.isArray(payload.aud) && typeof payload.aud[0] === "string") {
        return payload.aud[0];
    }

    return payload.sub ?? "oauth-client";
}

export async function authenticateJwt(token: string, logFailure: boolean): Promise<AuthResponse> {
    let payload: JWTPayload;
    try {
        const result = await jwtVerify(token, jwks, { issuer });
        payload = result.payload;
        if (typeof payload.sub !== "string" || !uuidPattern.test(payload.sub)) {
            return { success: false, error: "Invalid token" };
        }
    } catch (e) {
        if (logFailure) {
            console.error("failed to verify token", e);
        }
        return { success: false, error: "Invalid token" };
    }

    const [user] = await pool.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) {
        return { success: false, error: "Invalid token" };
    }

    return {
        success: true,
        authInfo: {
            token,
            clientId: clientIdFromPayload(payload),
            scopes: scopesFromPayload(payload),
            expiresAt: payload.exp,
            extra: {
                tokenType: "oauth-jwt",
                user,
            },
        },
    };
}

export default async function authenticate(request: Request): Promise<AuthResponse> {
    const parsed = parseAuthorizationHeader(request);
    if (!parsed.success) {
        return parsed;
    }

    if (parsed.type !== "bearer") {
        return { success: false, error: "Invalid authorization type" };
    }

    return authenticateJwt(parsed.token, false);
}
