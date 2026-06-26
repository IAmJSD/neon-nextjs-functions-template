import { Hono, type Context } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { McpAuthInfo } from "./authenticate";
import authenticate from "./authenticate";
import { resourceMetadataUrl } from "./authConfig";
import mcpServer from "./mcpServer";
import oauthRouter from "./oauth";

type McpEnv = {
    Variables: {
        auth: McpAuthInfo;
    };
};

const app = new Hono<McpEnv>();

function quoteAuthHeaderValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unauthorizedResponse(request: Request, error: string) {
    const errorDescription = quoteAuthHeaderValue(error);
    const metadataUrl = quoteAuthHeaderValue(resourceMetadataUrl(request));
    return new Response(JSON.stringify({
        error: "invalid_token",
        error_description: error,
    }), {
        status: 401,
        headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer error="invalid_token", error_description="${errorDescription}", resource_metadata="${metadataUrl}"`,
        },
    });
}

async function handleMcpRequest(c: Context<McpEnv>) {
    const auth = await authenticate(c.req.raw);
    if (!auth.success) {
        return unauthorizedResponse(c.req.raw, auth.error);
    }

    c.set("auth", auth.authInfo);
    const server = await mcpServer(c.get("auth"));
    const transport = new StreamableHTTPTransport();
    await server.connect(transport);
    return transport.handleRequest(c);
}

app.route("/", oauthRouter);
app.route("/mcp", oauthRouter);

app.all("/", handleMcpRequest);
app.all("/mcp", handleMcpRequest);

export default app;
