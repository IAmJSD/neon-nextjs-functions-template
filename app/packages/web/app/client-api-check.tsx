"use client";

import { useEffect, useState } from "react";
import rpcClient from "@/lib/trpc/client";

export default function ClientApiCheck() {
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpcClient.addOne
      .mutate(1)
      .then(setResult)
      .catch(() => setError("Unable to reach the API route."));
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Client example</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">
            {error ?? (result === null ? "Loading..." : result)}
          </p>
        </div>
        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          tRPC
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
        This client component calls <code className="font-mono">addOne(1)</code>{" "}
        after hydration.
      </p>
    </div>
  );
}
