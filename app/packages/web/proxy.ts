import auth from "./lib/auth/server";

export default auth.middleware({
  // Redirects unauthenticated users to sign-in page
  loginUrl: '/auth/sign-in',
});

export const config = {
    matcher: [
        // not /api*, /auth*, /openapi, /mcp, /.well-known, or Next.js internals
        '/((?!api|auth|openapi|mcp|\\.well-known|_next|favicon.ico).*)',
    ],
};
