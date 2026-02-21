import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { productId } = params;

  if (!productId) {
    return Response.json({ error: "Product ID is required" }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "published";
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build where clause
    const where: any = {
      productId,
      shopId: session.shop,
    };

    // Filter by status if provided
    if (status !== "all") {
      where.status = status;
    }

    // Get reviews with pagination
    const [reviews, totalCount] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          product: {
            select: {
              title: true,
              handle: true,
              imageUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.review.count({ where }),
    ]);

    return Response.json({
      reviews,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return Response.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
};
