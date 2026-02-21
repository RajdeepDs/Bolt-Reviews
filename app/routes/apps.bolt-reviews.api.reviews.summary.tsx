import { type LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return Response.json({ error: "Product ID is required" }, { status: 400 });
  }

  try {
    const reviews = await prisma.review.findMany({
      where: {
        productId,
        status: "published",
      },
      select: {
        rating: true,
      },
    });

    if (reviews.length === 0) {
      return Response.json({
        totalReviews: 0,
        averageRating: 0,
        distribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      });
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

    return Response.json({
      totalReviews,
      averageRating: Math.round(averageRating * 10) / 10,
      distribution,
    });
  } catch (error) {
    console.error("Error fetching review summary:", error);
    return Response.json(
      { error: "Failed to fetch review summary" },
      { status: 500 },
    );
  }
}
