import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  try {
    const body = await request.json();
    const {
      productId,
      customerName,
      customerEmail,
      rating,
      title,
      content,
      imageUrl,
      isVerified,
    } = body;

    // Validation
    if (!productId || !customerName || !rating || !title || !content) {
      return Response.json(
        {
          error:
            "Missing required fields: productId, customerName, rating, title, content",
        },
        { status: 400 },
      );
    }

    if (rating < 1 || rating > 5) {
      return Response.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 },
      );
    }

    // Verify product exists and belongs to this shop
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        shopId: session.shop,
      },
    });

    if (!product) {
      return Response.json(
        { error: "Product not found or does not belong to this shop" },
        { status: 404 },
      );
    }

    // Get shop settings to determine if auto-publish is enabled
    const settings = await prisma.settings.findUnique({
      where: {
        shopId: session.shop,
      },
    });

    let status = "pending";
    if (settings?.autoPublish) {
      // Check if rating meets minimum threshold
      if (rating >= (settings.minRatingToPublish || 1)) {
        status = "published";
      }
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        productId,
        shopId: session.shop,
        customerName,
        customerEmail: customerEmail || null,
        rating,
        title,
        content,
        status,
        isVerified: isVerified || false,
        imageUrl: imageUrl || null,
      },
      include: {
        product: {
          select: {
            title: true,
            handle: true,
            imageUrl: true,
          },
        },
      },
    });

    // Update product stats if review is published
    if (status === "published") {
      await updateProductStats(productId);
    }

    return Response.json(
      {
        success: true,
        review,
        message:
          status === "published"
            ? "Review created and published successfully"
            : "Review created and pending moderation",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating review:", error);
    return Response.json(
      { error: "Failed to create review", details: (error as Error).message },
      { status: 500 },
    );
  }
};

// Helper function to update product review stats
async function updateProductStats(productId: string) {
  const stats = await prisma.review.aggregate({
    where: {
      productId,
      status: "published",
    },
    _avg: {
      rating: true,
    },
    _count: {
      id: true,
    },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      averageRating: stats._avg.rating || 0,
      reviewCount: stats._count.id,
    },
  });
}
