"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type UserMenuProps = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  logoutAction: () => Promise<void>;
};

function initials(name?: string | null, email?: string | null) {
  const value = name || email || "User";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export default function UserMenu({ name, email, image, logoutAction }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setOpen(false);
    setIsLoggingOut(true);

    try {
      await logoutAction();
    } finally {
      window.location.assign("/");
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        onClick={() => setOpen((current) => !current)}
      >
        {image ? (
          <img
            src={image}
            alt=""
            className="h-9 w-9 rounded-full border border-slate-200 object-cover dark:border-slate-700"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-sm font-semibold text-white dark:bg-emerald-500 dark:text-slate-950">
            {initials(name, email)}
          </span>
        )}
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-slate-950 dark:text-slate-50">
            {name || "Signed in"}
          </span>
          <span className="block max-w-48 truncate text-xs text-slate-500 dark:text-slate-400">
            {email}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <Link
            href="/api-tokens"
            role="menuitem"
            className="block rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => setOpen(false)}
          >
            API Tokens
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            className="block rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <div className="border-t border-slate-100 pt-1 dark:border-slate-800">
            <button
              type="button"
              role="menuitem"
              disabled={isLoggingOut}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300 dark:text-red-300 dark:hover:bg-red-950/40 dark:disabled:text-red-800"
              onClick={handleLogout}
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
