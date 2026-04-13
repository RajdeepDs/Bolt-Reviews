import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { uploadImage } from "../utils/cloudinary.server";

/**
 * Authenticated image upload endpoint for the admin dashboard.
 * Accepts a single file via multipart/form-data and returns its Cloudinary URL.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File) || file.size === 0) {
      return Response.json(
        { error: "No image file provided" },
        { status: 400 },
      );
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return Response.json(
        { error: "File must be an image" },
        { status: 400 },
      );
    }

    // Validate file size (5MB limit)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return Response.json(
        { error: "Image must be smaller than 5MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadImage(buffer, file.type);

    return Response.json({ success: true, url });
  } catch (error) {
    console.error("Error uploading image:", error);
    return Response.json(
      { error: "Failed to upload image", details: (error as Error).message },
      { status: 500 },
    );
  }
};
