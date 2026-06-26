"use client";

import { createTRPCClient, httpLink, loggerLink } from "@trpc/client";
import type { AppRouter } from "api/src/trpc";

// Creates a client for the tRPC server which can be used in client components

let apiUrl: string;

if (process.env.NODE_ENV === "development") {
    apiUrl = "/api/rpc";
} else {
    apiUrl = process.env.NEXT_PUBLIC_API_URL!;
    if (!apiUrl) {
        throw new Error("NEXT_PUBLIC_API_URL is not set");
    }
    const u = new URL(apiUrl);
    u.pathname = "/api/rpc";
    apiUrl = u.toString();
}

type SessionTokenCache = {
    token: string | null;
    expiresAt: number;
};

let sessionTokenCache: Promise<SessionTokenCache> | undefined;

function tokenExpiresAt(token: string) {
    const [, payload] = token.split(".");
    if (!payload) {
        return 0;
    }

    try {
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const claims = JSON.parse(atob(padded)) as { exp?: unknown };
        return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
    } catch {
        return 0;
    }
}

async function getSessionToken() {
    if (process.env.NODE_ENV === "development") {
        return null;
    }

    if (sessionTokenCache) {
        const cached = await sessionTokenCache;
        if (cached.token && cached.expiresAt > Date.now() + 10_000) {
            return cached.token;
        }
    }

    sessionTokenCache = fetch("/auth/trpc-session", {
        cache: "no-store",
        credentials: "include",
    }).then(async (response): Promise<SessionTokenCache> => {
        if (!response.ok) {
            return { token: null, expiresAt: 0 };
        }

        const body = await response.json() as { token?: unknown };
        if (typeof body.token !== "string") {
            return { token: null, expiresAt: 0 };
        }

        return {
            token: body.token,
            expiresAt: tokenExpiresAt(body.token),
        };
    }).catch(() => ({ token: null, expiresAt: 0 }));

    return sessionTokenCache.then(({ token }) => token);
}

export default createTRPCClient<AppRouter>({
    links: [
        loggerLink({
            enabled: (opts) =>
                (process.env.NODE_ENV === 'development' &&
                  typeof window !== 'undefined') ||
                (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpLink({
            url: apiUrl,
            headers: async () => {
                const token = await getSessionToken();
                return token ? { Authorization: `Session ${token}` } : {};
            },
        }),
    ],
});
