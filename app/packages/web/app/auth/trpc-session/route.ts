import { cookies } from "next/headers";

const SESSION_DATA_COOKIE_NAME = "__Secure-neon-auth.local.session_data";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = (await cookies()).get(SESSION_DATA_COOKIE_NAME)?.value;
  if (!token) {
    return Response.json({
      error: "unauthorized",
    }, {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  return Response.json({
    token,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
