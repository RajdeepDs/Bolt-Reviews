import { type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const formData = await request.formData();
    const shopifyProductId = formData.get("productId") as string;
    const rating = parseInt(formData.get("rating") as string);
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const customerName = formData.get("customerName") as string;
    const customerEmail = formData.get("customerEmail") as string;
    const isVerified = formData.get("verified") === "true";

    if (!shopifyProductId || !rating || !title || !content || !customerName) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Find the product by Shopify product ID
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: shopifyProductId,
      },
      select: {
        id: true,
        shopId: true,
      },
    });

    if (!product) {
      return Response.json(
        { error: "Product not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Handle image upload
    let imageUrl: string | null = null;
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("photo") && value instanceof File && value.size > 0) {
        const buffer = await value.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const dataUrl = `data:${value.type};base64,${base64}`;
        imageUrl = dataUrl;
        break; // Only take the first photo for now
      }
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        productId: product.id,
        shopId: product.shopId,
        rating,
        title,
        content,
        customerName,
        customerEmail: customerEmail || null,
        isVerified,
        imageUrl,
        status: "published", // Auto-publish for now (can be changed to "pending" for moderation)
        helpful: 0,
        notHelpful: 0,
      },
    });

    // Update product statistics
    const reviews = await prisma.review.findMany({
      where: {
        productId: product.id,
        status: "published",
      },
      select: {
        rating: true,
      },
    });

    const reviewCount = reviews.length;
    const averageRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        reviewCount,
        averageRating,
      },
    });

    return Response.json(
      {
        success: true,
        review,
        message: "Review submitted successfully!",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error creating review:", error);
    return Response.json(
      { error: "Failed to submit review" },
      { status: 500, headers: corsHeaders },
    );
  }
}
