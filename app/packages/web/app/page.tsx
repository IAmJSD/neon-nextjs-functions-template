import { Suspense } from "react";
import ClientApiCheck from "./client-api-check";
import ServerApiCheck, { ServerApiCheckFallback } from "./server-api-check";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-5xl flex-col px-6 py-8">
      <section className="grid flex-1 content-center gap-6 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Neon serverless template
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-normal text-slate-950 dark:text-slate-50">
            A full-stack Next.js starter for database-backed products.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
            This template brings together the App Router, Neon Auth, a
            serverless Neon database with Drizzle migrations, shared tRPC and
            Hono API routes, OpenAPI output, and Neon Functions for API and MCP
            endpoints so you can start from an integrated application
            foundation.
          </p>
        </div>

        <div className="grid gap-4">
          <ClientApiCheck />
          <Suspense fallback={<ServerApiCheckFallback />}>
            <ServerApiCheck />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
