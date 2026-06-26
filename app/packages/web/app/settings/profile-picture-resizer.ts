export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const PROFILE_PICTURE_SIZE = 512;
const RESIZED_IMAGE_TYPE = "image/webp";
const RESIZED_IMAGE_QUALITY = 0.86;

export type AllowedImageType = typeof ALLOWED_IMAGE_TYPES[number];

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

export type ProfilePictureCrop = {
  x: number;
  y: number;
  size: number;
};

const fileExtensionByContentType: Record<AllowedImageType, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedImageType(value: string): value is AllowedImageType {
  return ALLOWED_IMAGE_TYPES.includes(value as AllowedImageType);
}

function replaceFileExtension(fileName: string, extension: string) {
  const normalizedExtension = extension.replace(/^\.+/, "");
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  return `${baseName || "profile-picture"}.${normalizedExtension}`;
}

async function decodeWithImageBitmap(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

function decodeWithImageElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Profile picture could not be read."));
    };

    image.decoding = "async";
    image.src = url;
  });
}

async function decodeImage(file: File) {
  if ("createImageBitmap" in window) {
    try {
      return await decodeWithImageBitmap(file);
    } catch {
      return decodeWithImageElement(file);
    }
  }

  return decodeWithImageElement(file);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Profile picture could not be resized."));
        return;
      }

      resolve(blob);
    }, RESIZED_IMAGE_TYPE, RESIZED_IMAGE_QUALITY);
  });
}

function normalizeCrop(decoded: DecodedImage, crop?: ProfilePictureCrop) {
  if (!crop) {
    const sourceSize = Math.min(decoded.width, decoded.height);

    return {
      sourceX: Math.floor((decoded.width - sourceSize) / 2),
      sourceY: Math.floor((decoded.height - sourceSize) / 2),
      sourceSize,
    };
  }

  const maxSize = Math.min(decoded.width, decoded.height);
  const sourceSize = Math.min(Math.max(crop.size, 1), maxSize);

  return {
    sourceX: Math.min(Math.max(crop.x, 0), decoded.width - sourceSize),
    sourceY: Math.min(Math.max(crop.y, 0), decoded.height - sourceSize),
    sourceSize,
  };
}

export async function resizeProfilePicture(file: File, crop?: ProfilePictureCrop) {
  if (file.type === "image/gif") {
    return file;
  }

  const decoded = await decodeImage(file);

  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new Error("Profile picture dimensions are invalid.");
    }

    const { sourceX, sourceY, sourceSize } = normalizeCrop(decoded, crop);
    const targetSize = Math.min(PROFILE_PICTURE_SIZE, Math.floor(sourceSize));
    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Profile picture could not be resized.");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      decoded.source,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      targetSize,
      targetSize,
    );

    const blob = await canvasToBlob(canvas);
    const contentType = isAllowedImageType(blob.type) ? blob.type : RESIZED_IMAGE_TYPE;
    const extension = fileExtensionByContentType[contentType];

    return new File([blob], replaceFileExtension(file.name, extension), {
      type: contentType,
      lastModified: Date.now(),
    });
  } finally {
    decoded.close?.();
  }
}
