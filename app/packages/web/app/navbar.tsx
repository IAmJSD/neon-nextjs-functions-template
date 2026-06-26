import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import authServer from "@/lib/auth/server";
import UserMenu from "./user-menu";

// TODO: change name
const navTitle = "Awesome Corp";

async function logout() {
  "use server";

  await authServer.signOut();
}

function NavbarRightFallback() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="hidden space-y-2 sm:block">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

async function NavbarRight() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth/sign-in"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Sign in
        </Link>
        <Link
          href="/auth/sign-up"
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <UserMenu name={user.name} email={user.email} image={user.image} logoutAction={logout} />
    </div>
  );
}

export default function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <nav className="mx-auto flex h-[72px] w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="truncate text-lg font-semibold text-slate-950 transition hover:text-emerald-700 dark:text-slate-50 dark:hover:text-emerald-400"
        >
          {navTitle}
        </Link>

        <Suspense fallback={<NavbarRightFallback />}>
          <NavbarRight />
        </Suspense>
      </nav>
    </header>
  );
}
