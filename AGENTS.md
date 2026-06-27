# AGENTS.md

Notes for coding agents working in this repository.

## Project Summary

This is a Neon + Next.js serverless starter implemented as an npm workspace monorepo. The web app is a Next.js App Router package, while the API and MCP server live in sibling packages that are imported directly during local development and deployed separately as Neon Functions for production.

The important mental model is:

- Local development is mostly a single Next.js dev server.
- Production ejects the API and MCP runtime code into Neon Functions declared in `neon.ts`.
- The shared `database` package owns Drizzle schema, migrations, and the Neon serverless DB client.

## Workspace Layout

```text
.
|-- app/packages/web      # Next.js App Router app
|-- app/packages/api      # Hono REST routes + tRPC router
|-- app/packages/mcp      # MCP server + OAuth endpoints
|-- database              # Drizzle schema, migrations, and DB client
|-- neon.ts               # Neon branch policy: Auth, bucket, functions
|-- patches               # patch-package patches
|-- package.json          # root npm workspace scripts
`-- package-lock.json     # npm lockfile
```

The root `package.json` declares these workspaces:

- `app/packages/*`
- `database`

Use npm, not pnpm/yarn/bun, unless the project is deliberately migrated.

## Common Commands

Run commands from the repo root unless stated otherwise.

```bash
npm install
npm run dev
npm run drizzle-kit -- generate
npm run drizzle-kit -- migrate
npm run drizzle-kit -- studio
npm run web:build
npm run web:start
```

Root scripts:

- `npm run dev` watches root `.env`, `.env.local`, and `.env.development`, then runs `npm run --workspace=web dev`.
- `npm run drizzle-kit -- <command>` forwards to the `database` workspace.
- `npm run web:build` and `npm run web:start` load root env through `dotenv-cli` before running Next commands.
- `postinstall` runs `patch-package`.

There are currently no root lint or test scripts. For type/build verification, use `npm run web:build`; for database changes, generate and inspect Drizzle migrations.

## Environment

The project expects Node.js 24 or newer.

Local env belongs at the repo root. The web Next config and Drizzle config load:

- `.env`
- `.env.local`
- `.env.development`

Core variables:

- `DATABASE_URL`: used by `database`, `api`, `mcp`, and Drizzle.
- `NEON_AUTH_BASE_URL`: used by web and MCP auth.
- `NEON_AUTH_JWKS_URL`: used by MCP bearer-token verification.
- `NEON_AUTH_COOKIE_SECRET`: used by web sessions and API session auth.
- `NEXT_PUBLIC_API_URL`: production base URL for the ejected API function.
- `MCP_WEB_ORIGIN`: public web origin used by the MCP OAuth browser redirect.
- `MCP_RESOURCE_SERVER_URL`: public URL for the ejected MCP resource server.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`: S3-compatible storage env used by avatar uploads.

`neon.ts` also reads required app-managed values at deploy time. If you add a new runtime env requirement to a Neon Function, update `neon.ts` so `neonctl deploy --env .env` passes it through.

## Local Development Model

In development, the Next.js app imports and serves the API and MCP packages directly:

- `app/packages/web/app/api/route.ts` imports `api/src` only when `NODE_ENV === "development"`.
- `app/packages/web/app/openapi/route.ts` re-exports the local API route handler.
- `app/packages/web/app/mcp/route.ts` imports `mcp/src` only when `NODE_ENV === "development"`.
- `app/packages/web/app/mcp/[...route]/route.ts` serves MCP OAuth routes and injects the current web session token for browser authorization.

This means `npm run dev` gives a convenient local monolith:

- Next app at `http://localhost:3000`
- Local REST API under `/api`
- Local tRPC under `/api/rpc`
- Local OpenAPI output under `/openapi`
- Local MCP endpoint under `/mcp`
- Local MCP OAuth authorization redirect under `/mcp/authorize`

Server-side tRPC in development uses `unstable_localLink` against the in-process `api` router. Client-side tRPC uses `/api/rpc`.

## Where Action Logic Belongs

Put meaningful action/business logic in the ejected API package whenever possible:

- Private, app-internal, user-authenticated actions should be tRPC procedures under `app/packages/api/src/trpc`.
- Public or integration-facing actions should be Hono REST/OpenAPI routes under `app/packages/api/src/apiRouters`.
- Next.js server actions in `app/packages/web` should stay thin: validate UI form shape if needed, call the tRPC/API layer, trigger redirects/revalidation, and handle presentation concerns.

This keeps database and service work on the Neon Function path after ejection. In production that means the code runs in the deployed `api` Neon Function instead of only inside the web app runtime, which is usually lower latency for Neon-backed operations and keeps the local/prod architecture aligned.

## Ejection To Neon Functions

"Ejection" in this repo means the API and MCP packages are split out of the local Next.js monolith and deployed as independent Neon Functions.

The split is defined in `neon.ts`:

```ts
preview: {
  buckets: {
    avatars: { access: "public_read" },
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
}
```

Deploy the Neon-managed pieces from the repo root:

```bash
neonctl auth
neonctl deploy --project-id <project-id> --branch <branch-id-or-name> --env .env
```

After ejection:

- The deployed API function serves `/api`, `/api/rpc`, and `/openapi`.
- The deployed MCP function serves MCP transport and OAuth metadata/token/registration routes.
- The web app should be deployed separately.
- The web app must receive `NEXT_PUBLIC_API_URL` pointing at the deployed API function.
- The MCP function must receive `MCP_WEB_ORIGIN` and `MCP_RESOURCE_SERVER_URL`.
- Database migrations must be applied against the target Neon branch.

Production web route behavior is intentionally different from development:

- `app/packages/web/app/api/route.ts` returns 404 outside development. Production API traffic should use the API Neon Function URL.
- `app/packages/web/app/mcp/route.ts` returns 404 outside development except CORS preflight support. MCP clients should use the MCP Neon Function URL.
- `app/packages/web/app/mcp/[...route]/route.ts` only keeps the browser OAuth authorization redirect on the web origin in production.

When changing API or MCP code, keep this runtime split in mind. Code in `api` and `mcp` should not depend on Next.js-only APIs, route handlers, cookies helpers, or web package internals unless that code path is explicitly development-only.

## Package Notes

### `app/packages/web`

Next.js App Router package.

Useful files:

- `app/page.tsx`: protected home page with tRPC examples.
- `app/navbar.tsx`: starter app name/navigation.
- `app/settings/*`: profile and avatar upload UI.
- `app/api-tokens/*`: API token UI and server actions.
- `app/api/auth/[...path]/route.ts`: Neon Auth route integration.
- `app/auth/sign-in/*` and `app/auth/sign-up/*`: auth pages/actions.
- `lib/auth/*`: Neon Auth server/client helpers.
- `lib/trpc/client.ts`: browser tRPC client.
- `lib/trpc/server.ts`: server-component tRPC client.
- `proxy.ts`: request/session gating.

Development adapters for ejected packages live in:

- `app/api/route.ts`
- `app/api/[...route]/route.ts`
- `app/openapi/route.ts`
- `app/mcp/route.ts`
- `app/mcp/[...route]/route.ts`

The `@/*` alias resolves inside `app/packages/web`.

### `app/packages/api`

Hono app plus tRPC router.

Useful files:

- `src/index.ts`: Hono app entrypoint exported as default. This is the Neon Function source.
- `src/apiRouters/index.ts`: top-level REST router mount.
- `src/apiRouters/apiV1/index.ts`: authenticated `/api/v1/hello` example.
- `src/trpc/index.ts`: tRPC router composition.
- `src/trpc/profilePicture.ts`: signed avatar upload flow using the `avatars` bucket.
- `src/trpc/trpcInit.ts`: tRPC initialization.
- `src/utils/authenticate.ts`: API auth for bearer API tokens and Neon session tokens.
- `src/utils/defineOpenapiRoute.ts`: REST/OpenAPI route helper.

The API supports:

- `Authorization: Bearer <api-token>` for tokens created in `/api-tokens`.
- `Authorization: Session <session-token>` for session-backed calls.
- Neon Auth session cookie fallback for local/session requests.

Add internal app procedures to the tRPC router. Add public REST/OpenAPI endpoints under `src/apiRouters`.

### `app/packages/mcp`

MCP server and OAuth implementation.

Useful files:

- `src/index.ts`: lazy Worker-style `fetch` entrypoint. This is the Neon Function source.
- `src/mcpApp.ts`: Hono app combining OAuth routes and MCP transport.
- `src/oauth.ts`: OAuth metadata, dynamic client registration, authorization code flow, token exchange.
- `src/oauthApp.ts`: web-side OAuth authorization app mounted by the Next web route.
- `src/authConfig.ts`: issuer/resource URL helpers and MCP OAuth env handling.
- `src/authenticate.ts`: bearer JWT validation against Neon Auth JWKS.
- `src/mcpServer.ts`: MCP server definition and tools.

Add or change MCP tools in `src/mcpServer.ts`. Keep tool outputs JSON-serializable.

### `database`

Shared Drizzle package.

Useful files:

- `schema.ts`: Drizzle tables, including API tokens and MCP OAuth tables.
- `pool.ts`: Neon serverless pool and Drizzle client.
- `drizzle.config.ts`: loads root env and points migrations at `database/migrations`.
- `migrations/*`: generated SQL and Drizzle metadata.

After changing `database/schema.ts`:

```bash
npm run drizzle-kit -- generate
npm run drizzle-kit -- migrate
```

Do not edit generated migration snapshots by hand unless you are intentionally repairing migration metadata.

## Neon Resource Policy

`neon.ts` declares the Neon resources expected by the app:

- Neon Auth enabled.
- Public-read `avatars` object storage bucket.
- `api` Neon Function from `app/packages/api/src/index.ts`.
- `mcp` Neon Function from `app/packages/mcp/src/index.ts`.

The avatar upload tRPC router imports `neon.ts` and uses `@neondatabase/env` to parse the storage env keys for the `avatars` bucket. If bucket names or access settings change, update both `neon.ts` and any code assuming `bucketName: "avatars"`.

## Auth And Data Model

The app uses Neon Auth's `users` table from `drizzle-orm/neon`.

Custom tables in `database/schema.ts`:

- `api_tokens`: bearer API token records.
- `mcp_oauth_clients`: MCP dynamic OAuth client registrations.
- `mcp_oauth_authorization_codes`: MCP OAuth authorization code state.

API token auth and MCP OAuth state both depend on the database. If auth behavior changes, verify both local development and ejected function behavior.

## Dependency Guidance

- Add package dependencies to the workspace that imports them.
- `api`, `mcp`, and `database` are workspace package names.
- `web` depends on `database` and has `api`/`mcp` as dev dependencies because it imports them for local development.
- `api` and `mcp` both depend on `database`.
- Keep `package-lock.json` updated when package manifests change.

## Editing Guidelines

- Prefer existing patterns and small changes.
- Keep API/MCP runtime code portable to the Neon Function environment.
- Keep web-only code in `app/packages/web`.
- Put private action logic in tRPC and public action logic in REST/OpenAPI so it runs through the ejected API Neon Function in production.
- If a new API/MCP env var is needed in production, wire it through `neon.ts`.
- If a schema changes, generate a migration.
- If routes change, update OpenAPI metadata/routes where applicable.
- If MCP OAuth URLs change, review `authConfig.ts` and production env values together.
- Search for `TODO` before shipping starter-derived deployments.

## Useful Checks Before Hand-Off

For most code changes:

```bash
npm run web:build
```

For database changes:

```bash
npm run drizzle-kit -- generate
npm run drizzle-kit -- migrate
```

For Neon deployment changes:

```bash
neonctl deploy --project-id <project-id> --branch <branch-id-or-name> --env .env
```

If you cannot run a check because credentials or Neon project access are missing, say that clearly in the hand-off.
