import authServer from "@/lib/auth/server";

const loadedMcpOAuth = import("mcp/src/oauthApp");
const isDevelopment = process.env.NODE_ENV === "development";

async function cloneRequest(request: Request, headers: Headers) {
  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  return new Request(request.url, init);
}

async function requestWithWebSessionToken(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete("x-mcp-web-session-token");

  const result = await authServer.token();
  const token = result.error ? null : result.data?.token;
  if (!token) {
    return cloneRequest(request, headers);
  }

  headers.set("x-mcp-web-session-token", token);
  return cloneRequest(request, headers);
}

async function handler(request: Request) {
  if (!isDevelopment && new URL(request.url).pathname !== "/mcp/authorize") {
    return Response.json({
      error: "not_found",
      error_description: "The web app only handles the MCP OAuth authorization redirect. Use the ejected MCP function URL for MCP clients.",
    }, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  return (await loadedMcpOAuth).default.fetch(await requestWithWebSessionToken(request));
}

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
