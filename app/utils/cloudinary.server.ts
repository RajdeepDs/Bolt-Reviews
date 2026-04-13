import { v2 as cloudinary } from "cloudinary";

/**
 * Ensure Cloudinary is configured. Called lazily so env vars
 * set by Shopify CLI at runtime are always available.
 */
function ensureConfigured() {
  const current = cloudinary.config();
  // Only reconfigure if not already set
  if (!current.cloud_name || !current.api_secret) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    console.log(
      "[cloudinary] configured — cloud:",
      process.env.CLOUDINARY_CLOUD_NAME,
      "| key:",
      process.env.CLOUDINARY_API_KEY ? "set" : "MISSING",
      "| secret:",
      process.env.CLOUDINARY_API_SECRET ? `set (${process.env.CLOUDINARY_API_SECRET.length} chars)` : "MISSING",
    );
  }
}

/**
 * Upload an image buffer to Cloudinary.
 *
 * @param buffer   – Raw file bytes
 * @param mimeType – MIME type of the image (e.g. "image/jpeg")
 * @param options  – Optional overrides (folder, public_id, etc.)
 * @returns The optimised CDN URL of the uploaded image
 */
export async function uploadImage(
  buffer: Buffer,
  mimeType: string,
  options?: { folder?: string; publicId?: string },
): Promise<string> {
  ensureConfigured();

  const folder = options?.folder ?? "bolt-reviews";

  // Convert buffer to base64 data URI for the upload() method
  const base64 = buffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: options?.publicId,
    resource_type: "image",
    format: "webp",
    quality: "auto",
  });

  return result.secure_url;
}

/**
 * Upload a single image file (from FormData) to Cloudinary.
 *
 * @param file – File object from FormData
 * @returns The optimised CDN URL
 */
export async function uploadSingleImage(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return uploadImage(buffer, file.type);
}

export default cloudinary;
