import { type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function action({ request, params }: ActionFunctionArgs) {
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

  const { reviewId } = params;

  if (!reviewId) {
    return Response.json(
      { error: "Review ID is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const body = await request.json();
    const { helpful } = body;

    if (typeof helpful !== "boolean") {
      return Response.json(
        { error: "Invalid helpful value" },
        { status: 400, headers: corsHeaders },
      );
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        helpful: true,
        notHelpful: true,
      },
    });

    if (!review) {
      return Response.json(
        { error: "Review not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        helpful: helpful ? { increment: 1 } : review.helpful,
        notHelpful: !helpful ? { increment: 1 } : review.notHelpful,
      },
      select: {
        id: true,
        helpful: true,
        notHelpful: true,
      },
    });

    return Response.json(
      {
        success: true,
        helpfulCount: updatedReview.helpful,
        notHelpfulCount: updatedReview.notHelpful,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error marking review as helpful:", error);
    return Response.json(
      { error: "Failed to update review" },
      { status: 500, headers: corsHeaders },
    );
  }
}
