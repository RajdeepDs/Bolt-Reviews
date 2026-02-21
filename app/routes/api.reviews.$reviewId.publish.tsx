import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "PATCH" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const { reviewId } = params;

  if (!reviewId) {
    return Response.json({ error: "Review ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { action: reviewAction } = body; // "publish" or "unpublish"

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

    // Determine new status
    let newStatus: string;
    if (reviewAction === "publish") {
      newStatus = "published";
    } else if (reviewAction === "unpublish") {
      newStatus = "pending";
    } else {
      return Response.json(
        { error: "Invalid action. Must be 'publish' or 'unpublish'" },
        { status: 400 },
      );
    }

    // Update the review
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: { status: newStatus },
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

    // Update product stats
    await updateProductStats(existingReview.productId);

    return Response.json({
      success: true,
      review: updatedReview,
      message: `Review ${reviewAction === "publish" ? "published" : "unpublished"} successfully`,
    });
  } catch (error) {
    console.error("Error updating review status:", error);
    return Response.json(
      {
        error: "Failed to update review status",
        details: (error as Error).message,
      },
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
