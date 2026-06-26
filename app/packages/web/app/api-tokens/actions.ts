"use server";

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import pool from "database/pool";
import { apiTokens } from "database/schema";
import { and, eq } from "drizzle-orm";
import authServer from "@/lib/auth/server";

export type ApiTokenActionState = {
  error?: string;
  message?: string;
  createdToken?: string;
};

const expirationOptions = new Map<string, number | null>([
  ["never", null],
  ["30", 30],
  ["90", 90],
  ["365", 365],
]);

async function requireUserId() {
  const session = await authServer.getSession();
  const userId = session.data?.user?.id;
  if (!userId) {
    redirect("/auth/sign-in");
  }
  return userId;
}

function tokenExpiresAt(value: FormDataEntryValue | null) {
  const days = expirationOptions.get(String(value ?? "never"));
  if (days === undefined || days === null) {
    return null;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

function clientIpAddress(headerList: Headers) {
  const forwardedFor = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headerList.get("x-real-ip") || "unknown";
}

export async function createApiToken(
  _prevState: ApiTokenActionState,
  formData: FormData,
): Promise<ApiTokenActionState> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();

  if (name.length < 2) {
    return { error: "Token name must be at least 2 characters." };
  }

  if (name.length > 80) {
    return { error: "Token name must be 80 characters or fewer." };
  }

  const token = `ntk_${randomBytes(32).toString("base64url")}`;
  const headerList = await headers();

  await pool.insert(apiTokens).values({
    id: randomUUID(),
    token,
    userId,
    expiresAt: tokenExpiresAt(formData.get("expiresIn")),
    createdByIpAddress: clientIpAddress(headerList),
    name,
  });

  revalidatePath("/api-tokens");

  return {
    message: "API token created. Copy it now; it will only be shown once.",
    createdToken: token,
  };
}

export async function revokeApiToken(
  _prevState: ApiTokenActionState,
  formData: FormData,
): Promise<ApiTokenActionState> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { error: "Token id is required." };
  }

  await pool.delete(apiTokens).where(and(
    eq(apiTokens.id, id),
    eq(apiTokens.userId, userId),
  ));

  revalidatePath("/api-tokens");

  return { message: "API token revoked." };
}
