const isDevelopment = process.env.NODE_ENV === "development";

async function handler(request: Request) {
    const url = new URL(request.url);
    if (isDevelopment) {
        return (await import("api/src")).default.fetch(
            new Request(url.toString(), request),
        );
    }

    return new Response("404 Not Found", { status: 404 });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export const HEAD = handler;
