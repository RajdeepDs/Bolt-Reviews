import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const { reviewId } = params;

  if (!reviewId) {
    return Response.json({ error: "Review ID is required" }, { status: 400 });
  }

  try {
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

    const productId = existingReview.productId;

    // Delete the review
    await prisma.review.delete({
      where: { id: reviewId },
    });

    // Update product stats after deletion
    await updateProductStats(productId);

    return Response.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return Response.json(
      { error: "Failed to delete review", details: (error as Error).message },
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
