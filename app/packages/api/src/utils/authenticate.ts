import pool from "database/pool";
import { apiTokens } from "database/schema";
import { eq, sql, type InferSelectModel } from "drizzle-orm";
import { users } from "drizzle-orm/neon";
import { jwtVerify, type JWTPayload } from "jose";

type AuthResponse = {
    success: false;
    error: string;
} | {
    success: true;
    user: InferSelectModel<typeof users>;
};

const neonAuthCookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
const sessionDataCookieName = "__Secure-neon-auth.local.session_data";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function userById(userId: string): Promise<AuthResponse> {
    try {
        const user = await pool.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user.length === 0) {
            return { success: false, error: "Invalid token" };
        }
        return { success: true, user: user[0] };
    } catch (e) {
        console.error("failed to get user", e);
        throw e;
    }
}

function userIdFromSessionPayload(payload: JWTPayload) {
    if (typeof payload.sub === "string" && uuidPattern.test(payload.sub)) {
        return payload.sub;
    }

    const user = payload.user;
    if (user && typeof user === "object" && !Array.isArray(user) && "id" in user && typeof user.id === "string" && uuidPattern.test(user.id)) {
        return user.id;
    }

    return null;
}

async function authenticateSessionDataToken(token: string): Promise<AuthResponse> {
    if (!neonAuthCookieSecret) {
        console.error("NEON_AUTH_COOKIE_SECRET is required for Session authorization");
        return { success: false, error: "Session authorization is not configured" };
    }

    try {
        const result = await jwtVerify(token, new TextEncoder().encode(neonAuthCookieSecret), { algorithms: ["HS256"] });
        const userId = userIdFromSessionPayload(result.payload);
        if (!userId) {
            return { success: false, error: "Invalid token" };
        }
        return userById(userId);
    } catch (e) {
        console.error("failed to verify session token", e);
        return { success: false, error: "Invalid token" };
    }
}

async function authenticateApiToken(token: string): Promise<AuthResponse> {
    const [apiToken] = await pool.select({
        id: apiTokens.id,
        userId: apiTokens.userId,
        expiresAt: apiTokens.expiresAt,
    }).from(apiTokens).where(eq(apiTokens.token, token)).limit(1);

    if (!apiToken) {
        return { success: false, error: "Invalid token" };
    }

    if (apiToken.expiresAt && apiToken.expiresAt.getTime() <= Date.now()) {
        return { success: false, error: "Invalid token" };
    }

    const stmt = pool.$with("api_token_update").as(pool.update(apiTokens).set({
        lastUsedAt: sql`now()`,
    }).where(eq(apiTokens.id, apiToken.id)).returning({
        user_id: apiTokens.userId,
    }));
    const user = await pool.with(stmt).select().from(users).where(eq(users.id, stmt.user_id)).limit(1);
    if (user.length === 0) {
        return { success: false, error: "Invalid token" };
    }
    return { success: true, user: user[0] };
}

function cookieValue(request: Request, name: string) {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) {
        return null;
    }

    for (const part of cookieHeader.split(";")) {
        const [rawName, ...rawValue] = part.trim().split("=");
        if (rawName === name && rawValue.length > 0) {
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

export default async function authenticate(request: Request): Promise<AuthResponse> {
    const authorizationHeader = request.headers.get("Authorization");

    if (!authorizationHeader) {
        const sessionDataToken = cookieValue(request, sessionDataCookieName);
        if (sessionDataToken) {
            return authenticateSessionDataToken(sessionDataToken);
        }

        return { success: false, error: "Authorization header is required" };
    }

    const s = authorizationHeader.split(" ");
    if (s.length !== 2 || !s[0] || !s[1]) {
        return { success: false, error: "Invalid authorization header" };
    }
    const type = s[0].toLowerCase();
    const token = s[1];

    if (type === "bearer") {
        return authenticateApiToken(token);
    }

    if (type === "session") {
        return authenticateSessionDataToken(token);
    }

    return { success: false, error: "Invalid authorization type" };
}
