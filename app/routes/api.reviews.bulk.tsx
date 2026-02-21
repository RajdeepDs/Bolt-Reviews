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
    const { reviewIds, action: bulkAction } = body;

    // Validation
    if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
      return Response.json(
        { error: "reviewIds array is required and must not be empty" },
        { status: 400 },
      );
    }

    if (!["publish", "unpublish", "delete", "reject"].includes(bulkAction)) {
      return Response.json(
        {
          error:
            "Invalid action. Must be 'publish', 'unpublish', 'delete', or 'reject'",
        },
        { status: 400 },
      );
    }

    // Verify all reviews belong to this shop
    const reviews = await prisma.review.findMany({
      where: {
        id: { in: reviewIds },
        shopId: session.shop,
      },
      select: {
        id: true,
        productId: true,
      },
    });

    if (reviews.length !== reviewIds.length) {
      return Response.json(
        { error: "Some reviews not found or do not belong to this shop" },
        { status: 404 },
      );
    }

    const affectedProductIds = [...new Set(reviews.map((r) => r.productId))];
    let result;

    switch (bulkAction) {
      case "publish":
        result = await prisma.review.updateMany({
          where: { id: { in: reviewIds } },
          data: { status: "published" },
        });
        break;

      case "unpublish":
        result = await prisma.review.updateMany({
          where: { id: { in: reviewIds } },
          data: { status: "pending" },
        });
        break;

      case "reject":
        result = await prisma.review.updateMany({
          where: { id: { in: reviewIds } },
          data: { status: "rejected" },
        });
        break;

      case "delete":
        result = await prisma.review.deleteMany({
          where: { id: { in: reviewIds } },
        });
        break;

      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    // Update stats for all affected products
    await Promise.all(
      affectedProductIds.map((productId) => updateProductStats(productId)),
    );

    return Response.json({
      success: true,
      affected: result.count,
      message: `Successfully ${bulkAction}ed ${result.count} review(s)`,
    });
  } catch (error) {
    console.error("Error performing bulk operation:", error);
    return Response.json(
      {
        error: "Failed to perform bulk operation",
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
