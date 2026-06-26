"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import authServer from "@/lib/auth/server";

export type ProfileActionState = {
  error?: string;
  message?: string;
};

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalFormString(formData: FormData, key: string) {
  const value = formString(formData, key);
  return value.length > 0 ? value : null;
}

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await authServer.getSession();
  if (!session.data?.user) {
    redirect("/auth/sign-in");
  }

  const name = formString(formData, "name");
  const phoneNumber = optionalFormString(formData, "phoneNumber");

  if (name.length < 1) {
    return { error: "Name is required." };
  }

  if (name.length > 80) {
    return { error: "Name must be 80 characters or fewer." };
  }

  if (phoneNumber && phoneNumber.length > 32) {
    return { error: "Phone number must be 32 characters or fewer." };
  }

  const { error } = await authServer.updateUser({
    name,
    phoneNumber,
  });

  if (error) {
    return { error: error.message || "Failed to update profile." };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");

  return { message: "Profile updated." };
}
