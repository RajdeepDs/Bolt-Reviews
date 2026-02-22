import { type LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopifyProductId = url.searchParams.get("productId");

  const corsHeaders = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });

  if (!shopifyProductId) {
    return new Response(JSON.stringify({ error: "Product ID is required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    // Find the product by Shopify product ID
    const product = await prisma.product.findFirst({
      where: {
        shopifyProductId: shopifyProductId,
      },
      select: {
        id: true,
      },
    });

    // If product doesn't exist, return empty summary
    if (!product) {
      return new Response(
        JSON.stringify({
          totalReviews: 0,
          averageRating: 0,
          distribution: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
          },
        }),
        { headers: corsHeaders },
      );
    }

    const reviews = await prisma.review.findMany({
      where: {
        productId: product.id,
        status: "published",
      },
      select: {
        rating: true,
      },
    });

    if (reviews.length === 0) {
      return new Response(
        JSON.stringify({
          totalReviews: 0,
          averageRating: 0,
          distribution: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
          },
        }),
        { headers: corsHeaders },
      );
    }

    const totalReviews = reviews.length;
    const sumRatings = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = sumRatings / totalReviews;

    const distribution = reviews.reduce(
      (acc, review) => {
        acc[review.rating] = (acc[review.rating] || 0) + 1;
        return acc;
      },
      { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
    );

    return new Response(
      JSON.stringify({
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10,
        distribution,
      }),
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error fetching review summary:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch review summary" }),
      { status: 500, headers: corsHeaders },
    );
  }
}
