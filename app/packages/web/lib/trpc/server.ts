import "server-only";
import { cookies } from "next/headers";
import { createTRPCClient, httpLink, loggerLink, unstable_localLink } from "@trpc/client";
import type { AppRouter } from "api/src/trpc";
import authServer from "@/lib/auth/server";

// Creates a client for the tRPC server which can be used in API routes and server components

const SESSION_DATA_COOKIE_NAME = "__Secure-neon-auth.local.session_data";
let apiUrl = "";

if (process.env.NODE_ENV !== "development") {
    apiUrl = process.env.NEXT_PUBLIC_API_URL!;
    if (!apiUrl) {
        throw new Error("NEXT_PUBLIC_API_URL is not set");
    }
    const u = new URL(apiUrl);
    u.pathname = "/api/rpc";
    apiUrl = u.toString();
}

const appRouterImport = process.env.NODE_ENV === "development" ? import("api/src/trpc") : null;

function toIsoDate(value: Date | string | null | undefined) {
    if (!value) {
        return null;
    }

    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export default async function getClient() {
    const c = await cookies();
    const sessionDataToken = c.get(SESSION_DATA_COOKIE_NAME)?.value;

    if (process.env.NODE_ENV !== "development") {
        if (!sessionDataToken) {
            return null;
        }

        return createTRPCClient<AppRouter>({
            links: [
                httpLink({ url: apiUrl, headers: { Authorization: `Session ${sessionDataToken}` } }),
            ],
        });
    }

    const session = await authServer.getSession();
    if (!session?.data?.user) {
        return null;
    }

    return createTRPCClient<AppRouter>({
        links: [
            loggerLink({}),
            unstable_localLink({
                router: (await appRouterImport)!.appRouter,
                createContext: async () => {
                    return {
                        user: {
                            ...session.data!.user,
                            createdAt: toIsoDate(session.data!.user.createdAt) ?? "",
                            updatedAt: toIsoDate(session.data!.user.updatedAt) ?? "",
                            image: session.data!.user.image ?? null,
                            role: session.data!.user.role ?? null,
                            banReason: session.data!.user.banReason ?? null,
                            banned: session.data!.user.banned ?? null,
                            banExpires: toIsoDate(session.data!.user.banExpires),
                        },
                    };
                },
            }),
        ],
    });
}
