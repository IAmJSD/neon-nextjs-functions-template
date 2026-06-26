"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createApiToken, revokeApiToken, type ApiTokenActionState } from "./actions";

export type ApiTokenListItem = {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function TokenNotice({ state }: { state: ApiTokenActionState }) {
  if (state.error) {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
        {state.error}
      </div>
    );
  }

  if (!state.message) {
    return null;
  }

  return (
    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">
      {state.message}
    </div>
  );
}

export default function ApiTokensClient({ tokens }: { tokens: ApiTokenListItem[] }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const [createState, createAction, isCreating] = useActionState(createApiToken, {});
  const [revokeState, revokeAction, isRevoking] = useActionState(revokeApiToken, {});

  useEffect(() => {
    if (createState.message || revokeState.message) {
      router.refresh();
    }
  }, [createState.message, revokeState.message, router]);

  useEffect(() => {
    if (createState.createdToken) {
      setCopied(false);
      setIsTokenModalOpen(true);
    }
  }, [createState.createdToken]);

  useEffect(() => {
    if (!isTokenModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTokenModalOpen(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    tokenInputRef.current?.select();

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTokenModalOpen]);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Create token</h2>
        <form action={createAction} className="mt-5 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={80}
              placeholder="Local development"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            />
          </div>

          <div>
            <label htmlFor="expiresIn" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Expiration
            </label>
            <select
              id="expiresIn"
              name="expiresIn"
              defaultValue="90"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="never">Never</option>
            </select>
          </div>

          <TokenNotice state={createState} />

          <button
            type="submit"
            disabled={isCreating}
            className="flex w-full justify-center rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            {isCreating ? "Creating..." : "Create token"}
          </button>
        </form>
      </section>

      {createState.createdToken && isTokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/70">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="created-token-title"
            aria-describedby="created-token-description"
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="created-token-title" className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                  Copy API token
                </h2>
                <p id="created-token-description" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  This token will only be shown once. Copy it before closing this window.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close token modal"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                onClick={() => setIsTokenModalOpen(false)}
              >
                X
              </button>
            </div>

            <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
              <label htmlFor="created-token" className="block text-xs font-medium uppercase tracking-normal text-emerald-800 dark:text-emerald-300">
                New token
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  ref={tokenInputRef}
                  id="created-token"
                  readOnly
                  value={createState.createdToken}
                  className="block min-w-0 rounded-md border border-emerald-200 bg-white px-3 py-2 font-mono text-sm text-slate-950 dark:border-emerald-800/60 dark:bg-slate-950 dark:text-slate-50"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                  onClick={async () => {
                    await navigator.clipboard.writeText(createState.createdToken!);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy token"}
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                onClick={() => setIsTokenModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Active tokens</h2>
          <div className="mt-2">
            <TokenNotice state={revokeState} />
          </div>
        </div>

        {tokens.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No API tokens yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {tokens.map((token) => (
              <div key={token.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-slate-950 dark:text-slate-50">{token.name}</h3>
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {token.tokenPreview}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                    <div>
                      <dt className="font-medium text-slate-700 dark:text-slate-200">Created</dt>
                      <dd>{formatDate(token.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700 dark:text-slate-200">Last used</dt>
                      <dd>{formatDate(token.lastUsedAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700 dark:text-slate-200">Expires</dt>
                      <dd>{formatDate(token.expiresAt)}</dd>
                    </div>
                  </dl>
                </div>

                <form action={revokeAction}>
                  <input type="hidden" name="id" value={token.id} />
                  <button
                    type="submit"
                    disabled={isRevoking}
                    className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40 dark:disabled:text-red-800"
                  >
                    Revoke
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
