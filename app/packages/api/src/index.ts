import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { fetchRequestHandler, type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { TRPCError } from "@trpc/server";
import api from "./apiRouters";
import { appRouter } from "./trpc";
import authenticate from "./utils/authenticate";

const app = new Hono();

function rpcCorsHeaders(request: Request) {
    const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
        "Access-Control-Allow-Origin": "*",
    };

    return headers;
}

function addRpcCorsHeaders(request: Request, res: Response) {
    for (const [key, value] of Object.entries(rpcCorsHeaders(request))) {
        res.headers.set(key, value);
    }
    return res;
}

app.route("/api", api);

app.get(
    "/openapi",
    openAPIRouteHandler(app, {
        // TODO: edit this
        documentation: {
            info: {
                title: "API",
                version: "1.0.0",
            },
            servers: [
                { url: "http://localhost:3000" },
            ],
        },
    }),
);

async function createContext(ctx: FetchCreateContextFnOptions) {
    const userRes = await authenticate(ctx.req);
    if (!userRes.success) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: userRes.error });
    }
    return {
        user: userRes.user,
    };
}

app.options("/api/rpc/:path", (c) => {
    return new Response(null, {
        status: 204,
        headers: rpcCorsHeaders(c.req.raw),
    });
});

app.all("/api/rpc/:path", async (c) => {
    const res = await fetchRequestHandler({
        endpoint: "/api/rpc",
        req: c.req.raw,
        router: appRouter,
        createContext,
    });

    return addRpcCorsHeaders(c.req.raw, res);
});

export default app;
