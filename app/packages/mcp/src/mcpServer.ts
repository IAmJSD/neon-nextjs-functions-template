import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpAuthInfo } from "./authenticate";

function toJsonValue(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === "bigint") {
        return value.toString();
    }

    if (Array.isArray(value)) {
        return value.map(toJsonValue);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, entryValue]) => [key, toJsonValue(entryValue)]),
        );
    }

    return value;
}

function getCurrentUserPayload(authInfo: McpAuthInfo) {
    const user = authInfo.extra.user;

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: toJsonValue(user.createdAt),
        updatedAt: toJsonValue(user.updatedAt),
        role: user.role,
    };
}

export default async (authInfo: McpAuthInfo) => {
    const server = new McpServer({
        name: "my-mcp-server",
        version: "1.0.0",
        description: "My MCP server",
    });

    server.registerTool(
        "get-user",
        {
            title: "Get user",
            description: "Return the currently authenticated user's profile for this MCP session.",
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async () => {
            const payload = {
                user: getCurrentUserPayload(authInfo),
            };

            return {
                structuredContent: payload as Record<string, unknown>,
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(payload, null, 2),
                    },
                ],
            };
        },
    );

    return server;
};
