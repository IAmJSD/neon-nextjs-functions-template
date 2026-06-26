import { createNeonAuth } from '@neondatabase/auth/next/server';

function cookieSameSite() {
  const value = process.env.NEON_AUTH_COOKIE_SAME_SITE;
  if (!value) {
    return undefined;
  }

  if (value === "strict" || value === "lax" || value === "none") {
    return value;
  }

  throw new Error("NEON_AUTH_COOKIE_SAME_SITE must be one of: strict, lax, none");
}

export default createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    domain: process.env.NEON_AUTH_COOKIE_DOMAIN,
    sameSite: cookieSameSite(),
  },
});
