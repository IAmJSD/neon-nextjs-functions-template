"use client";

import { type ChangeEvent, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import authClient from "@/lib/auth/client";
import rpcClient from "@/lib/trpc/client";
import { updateProfile, type ProfileActionState } from "./actions";
import ProfilePictureCropper from "./profile-picture-cropper";
import { ALLOWED_IMAGE_TYPES, isAllowedImageType, resizeProfilePicture, type ProfilePictureCrop } from "./profile-picture-resizer";

export type SettingsProfileUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean | null;
  role: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_SOURCE_IMAGE_SIZE = 20 * 1024 * 1024;

type CropDraft = {
  file: File;
  previewUrl: string;
};

function initials(name: string | null, email: string) {
  const value = name || email || "User";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function StatusNotice({ state }: { state: ProfileActionState }) {
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to update profile picture.";
}

export default function ProfileForm({ user }: { user: SettingsProfileUser }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(updateProfile, {});
  const [previewImage, setPreviewImage] = useState(user.image);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.message) {
      router.refresh();
    }
  }, [router, state.message]);

  useEffect(() => {
    setPreviewImage(user.image);
  }, [user.image]);

  useEffect(() => {
    return () => {
      if (cropDraft) {
        URL.revokeObjectURL(cropDraft.previewUrl);
      }
    };
  }, [cropDraft]);

  function openFilePicker() {
    if (isUploading || cropDraft) {
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void prepareProfilePicture(file);
  }

  function validateProfilePictureFile(file: File) {
    if (isUploading) {
      return false;
    }

    if (!isAllowedImageType(file.type)) {
      setUploadError("Profile picture must be a JPEG, PNG, WebP, or GIF.");
      return false;
    }

    if (file.size > MAX_SOURCE_IMAGE_SIZE) {
      setUploadError("Profile picture must be 20 MB or smaller.");
      return false;
    }

    if (file.type === "image/gif" && file.size > MAX_IMAGE_SIZE) {
      setUploadError("GIF profile pictures must be 5 MB or smaller.");
      return false;
    }

    return true;
  }

  async function prepareProfilePicture(file: File) {
    if (!validateProfilePictureFile(file)) {
      return;
    }

    setUploadError(null);
    setUploadMessage(null);

    if (file.type === "image/gif") {
      await uploadProfilePicture(file);
      return;
    }

    setCropDraft({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  function cancelCrop() {
    setCropDraft(null);
    setFileInputKey((key) => key + 1);
  }

  function applyCrop(crop: ProfilePictureCrop) {
    if (!cropDraft) {
      return;
    }

    const file = cropDraft.file;
    setCropDraft(null);
    void uploadProfilePicture(file, crop);
  }

  async function uploadProfilePicture(file: File, crop?: ProfilePictureCrop) {
    if (!validateProfilePictureFile(file)) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      const uploadFile = await resizeProfilePicture(file, crop);

      if (!isAllowedImageType(uploadFile.type)) {
        throw new Error("Profile picture could not be converted to a supported format.");
      }

      if (uploadFile.size < 1) {
        throw new Error("Profile picture could not be resized.");
      }

      if (uploadFile.size > MAX_IMAGE_SIZE) {
        setUploadError("Profile picture must be 5 MB or smaller after resizing.");
        return;
      }

      const uploadContentType = uploadFile.type;
      const signedUpload = await rpcClient.profilePicture.createSignedUpload.mutate({
        fileName: uploadFile.name,
        contentType: uploadContentType,
        size: uploadFile.size,
      });

      const uploadResponse = await fetch(signedUpload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": uploadContentType,
        },
        body: uploadFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("Profile picture upload failed.");
      }

      const verifiedUpload = await rpcClient.profilePicture.verifyUpload.mutate({
        key: signedUpload.key,
        uploadId: signedUpload.uploadId,
      });

      const { error: authUpdateError } = await authClient.updateUser({
        image: verifiedUpload.imageUrl,
      });

      if (authUpdateError) {
        throw new Error(authUpdateError.message || "Profile picture was uploaded, but the session could not be refreshed.");
      }

      setPreviewImage(verifiedUpload.imageUrl);
      setFileInputKey((key) => key + 1);
      setUploadMessage("Profile picture updated.");
      router.refresh();
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex w-24 shrink-0 flex-col items-center gap-2">
            <input
              key={fileInputKey}
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              onChange={handleFileChange}
              className="sr-only"
            />
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading || Boolean(cropDraft)}
              aria-label="Edit profile picture"
              className="grid h-16 w-16 place-items-center rounded-full outline-none transition focus:ring-2 focus:ring-emerald-600/30 disabled:cursor-wait dark:focus:ring-emerald-400/30"
            >
              {previewImage ? (
                <img
                  src={previewImage}
                  alt=""
                  className="h-16 w-16 rounded-full border border-slate-200 object-cover transition hover:brightness-95 dark:border-slate-700 dark:hover:brightness-110"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-950 text-lg font-semibold text-white transition hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400">
                  {initials(user.name, user.email)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading || Boolean(cropDraft)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
            >
              {isUploading ? "Uploading..." : "Edit"}
            </button>
          </div>

          <form action={formAction} className="grid flex-1 gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Profile</h2>
            </div>

            {uploadError ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
                {uploadError}
              </div>
            ) : null}

            {uploadMessage ? (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">
                {uploadMessage}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  maxLength={80}
                  defaultValue={user.name ?? ""}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Phone
                </label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  maxLength={32}
                  defaultValue={user.phoneNumber ?? ""}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </div>
            </div>

            <StatusNotice state={state} />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              >
                {isPending ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Account</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Email</dt>
            <dd className="mt-1 break-words text-slate-600 dark:text-slate-300">{user.email}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Email verified</dt>
            <dd className="mt-1 text-slate-600 dark:text-slate-300">{user.emailVerified ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Phone verified</dt>
            <dd className="mt-1 text-slate-600 dark:text-slate-300">
              {user.phoneNumberVerified === null ? "Not available" : user.phoneNumberVerified ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Role</dt>
            <dd className="mt-1 text-slate-600 dark:text-slate-300">{user.role || "User"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Created</dt>
            <dd className="mt-1 text-slate-600 dark:text-slate-300">{formatDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700 dark:text-slate-200">Updated</dt>
            <dd className="mt-1 text-slate-600 dark:text-slate-300">{formatDate(user.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      {cropDraft ? (
        <ProfilePictureCropper
          imageUrl={cropDraft.previewUrl}
          isUploading={isUploading}
          onCancel={cancelCrop}
          onConfirm={applyCrop}
        />
      ) : null}
    </div>
  );
}
