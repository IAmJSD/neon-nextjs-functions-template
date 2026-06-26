import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NEON_ENV_VAR_KEYS, parseEnv } from "@neondatabase/env";
import { TRPCError } from "@trpc/server";
import pool from "database/pool";
import { eq, sql } from "drizzle-orm";
import { users } from "drizzle-orm/neon";
import { integer, maxLength, maxValue, minLength, minValue, number, object, picklist, pipe, string } from "valibot";
import neonConfig from "../../../../../neon";
import { publicProcedure, router } from "./trpcInit";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const SIGNED_UPLOAD_EXPIRES_IN_SECONDS = 300;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const STORAGE_ENV_KEYS = [
    NEON_ENV_VAR_KEYS.storage.accessKeyId,
    NEON_ENV_VAR_KEYS.storage.secretAccessKey,
    NEON_ENV_VAR_KEYS.storage.endpoint,
    NEON_ENV_VAR_KEYS.storage.region,
] as const;

type AllowedImageType = typeof ALLOWED_IMAGE_TYPES[number];

type UploadTokenPayload = {
    version: 1;
    userId: string;
    key: string;
    contentType: AllowedImageType;
    size: number;
    expiresAt: number;
};

type StorageConfig = {
    bucketName: string;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
};

const createSignedUploadInput = object({
    fileName: pipe(string(), minLength(1), maxLength(255)),
    contentType: picklist(ALLOWED_IMAGE_TYPES),
    size: pipe(number(), integer(), minValue(1), maxValue(MAX_UPLOAD_SIZE)),
});

const verifyUploadInput = object({
    uploadId: pipe(string(), minLength(1)),
    key: pipe(string(), minLength(1), maxLength(500)),
});

const fileExtensionByContentType: Record<AllowedImageType, string> = {
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

let s3Client: S3Client | undefined;
let s3ClientConfigKey: string | undefined;

function getStorageConfig(): StorageConfig {
    let storage;
    try {
        storage = parseEnv(neonConfig, STORAGE_ENV_KEYS).storage;
    } catch (error) {
        throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error instanceof Error ? error.message : "Object storage is not configured.",
            cause: error,
        });
    }

    return {
        bucketName: "avatars",
        endpoint: storage.endpoint,
        region: storage.region,
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
    };
}

function getS3Client(config: StorageConfig) {
    const configKey = JSON.stringify({
        endpoint: config.endpoint,
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
    });

    if (!s3Client || s3ClientConfigKey !== configKey) {
        s3Client = new S3Client({
            endpoint: config.endpoint,
            forcePathStyle: true,
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        s3ClientConfigKey = configKey;
    }

    return s3Client;
}

function encodePath(value: string) {
    return value.split("/").map(encodeURIComponent).join("/");
}

function publicObjectUrl(config: StorageConfig, key: string) {
    return `${config.endpoint.replace(/\/+$/, "")}/${encodePath(config.bucketName)}/${encodePath(key)}`;
}

function uploadKey(userId: string, contentType: AllowedImageType) {
    return `profile-pictures/${userId}/${randomUUID()}.${fileExtensionByContentType[contentType]}`;
}

function signPayload(payload: string, config: StorageConfig) {
    return createHmac("sha256", config.secretAccessKey).update(payload).digest("base64url");
}

function createUploadId(payload: UploadTokenPayload, config: StorageConfig) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encodedPayload}.${signPayload(encodedPayload, config)}`;
}

function parseUploadId(uploadId: string, config: StorageConfig): UploadTokenPayload {
    const [encodedPayload, signature] = uploadId.split(".");
    if (!encodedPayload || !signature) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid upload verification token." });
    }

    const expectedSignature = signPayload(encodedPayload, config);
    const signatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);
    if (
        signatureBuffer.length !== expectedSignatureBuffer.length ||
        !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid upload verification token." });
    }

    try {
        const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as UploadTokenPayload;
        if (
            parsed.version !== 1 ||
            typeof parsed.userId !== "string" ||
            typeof parsed.key !== "string" ||
            !ALLOWED_IMAGE_TYPES.includes(parsed.contentType) ||
            typeof parsed.size !== "number" ||
            typeof parsed.expiresAt !== "number"
        ) {
            throw new Error("Invalid upload token payload");
        }
        return parsed;
    } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid upload verification token." });
    }
}

export const profilePictureRouter = router({
    createSignedUpload: publicProcedure.input(createSignedUploadInput).mutation(async ({ ctx, input }) => {
        const config = getStorageConfig();
        const key = uploadKey(ctx.user.id, input.contentType);
        const expiresAt = Date.now() + SIGNED_UPLOAD_EXPIRES_IN_SECONDS * 1000;
        const uploadId = createUploadId({
            version: 1,
            userId: ctx.user.id,
            key,
            contentType: input.contentType,
            size: input.size,
            expiresAt,
        }, config);

        const uploadUrl = await getSignedUrl(
            getS3Client(config),
            new PutObjectCommand({
                Bucket: config.bucketName,
                Key: key,
                ContentType: input.contentType,
            }),
            { expiresIn: SIGNED_UPLOAD_EXPIRES_IN_SECONDS },
        );

        return {
            key,
            uploadId,
            uploadUrl,
            expiresAt,
            maxSize: MAX_UPLOAD_SIZE,
            publicUrl: publicObjectUrl(config, key),
        };
    }),

    verifyUpload: publicProcedure.input(verifyUploadInput).mutation(async ({ ctx, input }) => {
        const config = getStorageConfig();
        const payload = parseUploadId(input.uploadId, config);

        if (payload.userId !== ctx.user.id || payload.key !== input.key || payload.expiresAt < Date.now()) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Upload verification token has expired or is invalid." });
        }

        let uploadedObject;
        try {
            uploadedObject = await getS3Client(config).send(new HeadObjectCommand({
                Bucket: config.bucketName,
                Key: payload.key,
            }));
        } catch {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded profile picture could not be found." });
        }

        const uploadedContentType = uploadedObject.ContentType?.split(";")[0]?.toLowerCase();
        if (uploadedContentType !== payload.contentType) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded profile picture type did not match the signed upload." });
        }

        if (uploadedObject.ContentLength !== payload.size) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded profile picture size did not match the signed upload." });
        }

        const imageUrl = publicObjectUrl(config, payload.key);
        await pool.update(users).set({
            image: imageUrl,
            updatedAt: sql`now()`,
        }).where(eq(users.id, ctx.user.id));

        return { imageUrl };
    }),
});
