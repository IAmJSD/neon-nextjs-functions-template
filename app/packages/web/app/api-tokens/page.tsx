import { redirect } from "next/navigation";
import pool from "database/pool";
import { apiTokens } from "database/schema";
import { desc, eq } from "drizzle-orm";
import authServer from "@/lib/auth/server";
import ApiTokensClient, { type ApiTokenListItem } from "./api-tokens-client";

export const dynamic = "force-dynamic";

function previewToken(token: string) {
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

function serializeDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

export default async function ApiTokensPage() {
  const session = await authServer.getSession();
  const userId = session.data?.user?.id;

  if (!userId) {
    redirect("/auth/sign-in");
  }

  const rows = await pool.select({
    id: apiTokens.id,
    name: apiTokens.name,
    token: apiTokens.token,
    createdAt: apiTokens.createdAt,
    expiresAt: apiTokens.expiresAt,
    lastUsedAt: apiTokens.lastUsedAt,
  }).from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(desc(apiTokens.createdAt));

  const tokens: ApiTokenListItem[] = rows.map((token) => ({
    id: token.id,
    name: token.name,
    tokenPreview: previewToken(token.token),
    createdAt: token.createdAt.toISOString(),
    expiresAt: serializeDate(token.expiresAt),
    lastUsedAt: serializeDate(token.lastUsedAt),
  }));

  return (
    <main className="mx-auto min-h-[calc(100vh-72px)] w-full max-w-6xl px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-slate-50">API tokens</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Create and revoke bearer tokens for API access.
          </p>
        </div>
      </header>

      <div className="py-8">
        <ApiTokensClient tokens={tokens} />
      </div>
    </main>
  );
}
