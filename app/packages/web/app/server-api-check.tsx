import getClient from "@/lib/trpc/server";

export function ServerApiCheckFallback() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Server example</p>
          <p className="mt-1 text-2xl font-semibold text-slate-400 dark:text-slate-500">Loading...</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          Suspense
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Waiting for the server component to resolve.
      </p>
    </div>
  );
}

export default async function ServerApiCheck() {
  const client = await getClient();

  if (!client) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Server example</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">
              Unauthorized
            </p>
          </div>
          <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
            Server
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
          The server component needs an authenticated session.
        </p>
      </div>
    );
  }

  const result = await client.addOne.mutate(41);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Server example</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{result}</p>
        </div>
        <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
          Suspense
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
        This async server component runs <code className="font-mono">addOne(41)</code>{" "}
        inside a <code className="font-mono">Suspense</code> boundary.
      </p>
    </div>
  );
}
