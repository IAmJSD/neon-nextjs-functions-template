import "dotenv/config";
import { defineConfig } from "@neondatabase/config/v1";

function getEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Environment variable ${name} is not set`);
    }
    return value;
}

export default defineConfig({
    auth: {
        enabled: true,
    },
    preview: {
        buckets: {
            avatars: {
                access: "public_read",
            },
        },
        functions: {
            api: {
                name: "api",
                source: "app/packages/api/src/index.ts",
                env: {
                    NEON_AUTH_COOKIE_SECRET: getEnv("NEON_AUTH_COOKIE_SECRET"),
                },
            },
            mcp: {
                name: "mcp",
                source: "app/packages/mcp/src/index.ts",
                env: {
                    MCP_WEB_ORIGIN: getEnv("MCP_WEB_ORIGIN"),
                    MCP_RESOURCE_SERVER_URL: getEnv("MCP_RESOURCE_SERVER_URL"),
                },
            },
        },
    }, 
});
