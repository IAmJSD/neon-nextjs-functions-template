const loadedMcpOAuth = import("mcp/src/oauthApp");

const WELL_KNOWN_MCP_ALIASES = new Map([
  ["/.well-known/oauth-protected-resource/mcp", "/mcp/.well-known/oauth-protected-resource"],
  ["/.well-known/oauth-authorization-server/mcp", "/mcp/.well-known/oauth-authorization-server"],
]);

async function handler(request: Request) {
  const url = new URL(request.url);
  const targetPath = WELL_KNOWN_MCP_ALIASES.get(url.pathname);

  if (!targetPath) {
    return new Response("404 Not Found", { status: 404 });
  }

  url.pathname = targetPath;
  return (await loadedMcpOAuth).default.fetch(new Request(url, {
    method: request.method,
    headers: request.headers,
  }));
}

export const GET = handler;
export const OPTIONS = handler;
