// Client-side image helpers shared by the new + edit product forms.
// These run only in the browser (canvas / Image / dynamic heic2any import).

import { deriveSizeType } from "@/lib/product-utils";

const MAX_DIM = 2400; // matches the site's image convention
// Inspiration is a secondary supporting image (shown small), so it's downscaled
// harder to keep the Server Action POST body well under Vercel's ~4.5MB cap.
const INSPIRATION_MAX_DIM = 1600;
const INSPIRATION_QUALITY = 0.82;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Downscale to maxDim and re-encode as JPEG so the upload stays small. */
async function resizeToJpeg(
  img: HTMLImageElement,
  maxDim = MAX_DIM,
  quality = 0.85
): Promise<{ file: File; w: number; h: number }> {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
  return { file: new File([blob], "upload.jpg", { type: "image/jpeg" }), w, h };
}

/** Tiny base64 JPEG used as a blur-up placeholder while the image loads. */
function makeBlurDataURL(img: HTMLImageElement): string {
  const w = 16;
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.4);
}

export type ProcessedImage = {
  file: File;
  width: number;
  height: number;
  sizeType: string;
  blurDataURL: string;
};

/** HEIC→JPEG (if needed), load, and downscale. Throws if it can't be decoded. */
async function toJpeg(
  file: File,
  maxDim = MAX_DIM,
  quality = 0.85
): Promise<{ file: File; w: number; h: number; img: HTMLImageElement }> {
  let working = file;
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    if (!blob) throw new Error("The HEIC image couldn't be converted.");
    working = new File([blob], "converted.jpg", { type: "image/jpeg" });
  }
  const img = await loadImage(working);
  const resized = await resizeToJpeg(img, maxDim, quality);
  return { ...resized, img };
}

/**
 * Convert HEIC→JPEG if needed, downscale, and detect the size type.
 */
export async function processImageFile(file: File, sizeTypes: string[]): Promise<ProcessedImage> {
  const { file: out, w, h, img } = await toJpeg(file);
  return {
    file: out,
    width: w,
    height: h,
    sizeType: deriveSizeType(w, h, sizeTypes),
    blurDataURL: makeBlurDataURL(img),
  };
}

/** Just convert + downscale (no size-type / blur) — used for the inspiration photo.
 *  Smaller than the main image so the Server Action POST stays under the body limit. */
export async function convertAndResize(file: File): Promise<File> {
  return (await toJpeg(file, INSPIRATION_MAX_DIM, INSPIRATION_QUALITY)).file;
}

/** Read GPS coordinates from a photo's EXIF (the original file, before resize). */
export async function readGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const exifr = (await import("exifr")).default;
    const g = await exifr.gps(file);
    if (g && typeof g.latitude === "number" && typeof g.longitude === "number") {
      return { lat: g.latitude, lng: g.longitude };
    }
  } catch {
    // no EXIF / unreadable — fall through
  }
  return null;
}
