import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST" && request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const { reviewId } = params;

  if (!reviewId) {
    return Response.json({ error: "Review ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { reply } = body;

    if (typeof reply !== "string") {
      return Response.json(
        { error: "Reply must be a string" },
        { status: 400 },
      );
    }

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

    // Update with reply (or clear reply if empty string)
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        merchantReply: reply.trim() || null,
        merchantReplyAt: reply.trim() ? new Date() : null,
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return Response.json({
      success: true,
      review: updatedReview,
      message: reply.trim()
        ? "Reply saved successfully"
        : "Reply removed successfully",
    });
  } catch (error) {
    console.error("Error saving merchant reply:", error);
    return Response.json(
      {
        error: "Failed to save reply",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
};
