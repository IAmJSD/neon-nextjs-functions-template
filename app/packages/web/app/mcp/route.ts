const possiblyLoadedMcp = process.env.NODE_ENV === "development" ? import("mcp/src") : null;

async function handler(request: Request) {
    if (possiblyLoadedMcp) {
        return (await possiblyLoadedMcp).default.fetch(request);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        },
      });
    }

    return Response.json({
      error: "mcp_not_served_from_web",
      error_description: "Use the ejected MCP function URL for MCP clients. The web app only handles the OAuth browser redirect.",
    }, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
}

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
