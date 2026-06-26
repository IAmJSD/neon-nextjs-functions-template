import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import ProfileForm, { type SettingsProfileUser } from "./profile-form";

export const dynamic = "force-dynamic";

function serializeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const authUser = user as typeof user & {
    phoneNumber?: string | null;
    phoneNumberVerified?: boolean | null;
    role?: string | null;
  };

  const profileUser: SettingsProfileUser = {
    id: authUser.id,
    name: authUser.name ?? null,
    email: authUser.email,
    image: authUser.image ?? null,
    emailVerified: authUser.emailVerified,
    phoneNumber: authUser.phoneNumber ?? null,
    phoneNumberVerified: authUser.phoneNumberVerified ?? null,
    role: authUser.role ?? null,
    createdAt: serializeDate(authUser.createdAt),
    updatedAt: serializeDate(authUser.updatedAt),
  };

  return (
    <main className="mx-auto min-h-[calc(100vh-72px)] w-full max-w-4xl px-6 py-8">
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="mt-2 text-3xl font-semibold text-slate-950 dark:text-slate-50">Settings</h1>
      </header>

      <ProfileForm user={profileUser} />
    </main>
  );
}
