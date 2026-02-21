import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "PATCH" && request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const { reviewId } = params;

  if (!reviewId) {
    return Response.json({ error: "Review ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const {
      customerName,
      customerEmail,
      rating,
      title,
      content,
      status,
      isVerified,
      imageUrl,
    } = body;

    // Verify review exists and belongs to this shop
    const existingReview = await prisma.review.findFirst({
      where: {
        id: reviewId,
        shopId: session.shop,
      },
    });

    if (!existingReview) {
      return Response.json(
        { error: "Review not found or does not belong to this shop" },
        { status: 404 },
      );
    }

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return Response.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 },
      );
    }

    // Validate status if provided
    if (status && !["pending", "published", "rejected"].includes(status)) {
      return Response.json(
        { error: "Status must be 'pending', 'published', or 'rejected'" },
        { status: 400 },
      );
    }

    // Build update data object (only include fields that were provided)
    const updateData: any = {};
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
    if (rating !== undefined) updateData.rating = rating;
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (status !== undefined) updateData.status = status;
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    // Update the review
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: updateData,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            handle: true,
            imageUrl: true,
          },
        },
      },
    });

    // Update product stats if rating or status changed
    if (rating !== undefined || status !== undefined) {
      await updateProductStats(existingReview.productId);
    }

    return Response.json({
      success: true,
      review: updatedReview,
      message: "Review updated successfully",
    });
  } catch (error) {
    console.error("Error updating review:", error);
    return Response.json(
      { error: "Failed to update review", details: (error as Error).message },
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
