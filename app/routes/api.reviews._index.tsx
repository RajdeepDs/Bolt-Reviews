import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "all";
    const productId = url.searchParams.get("productId");
    const search = url.searchParams.get("search") || "";
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const rating = url.searchParams.get("rating");

    // Build where clause
    const where: any = {
      shopId: session.shop,
    };

    // Filter by status
    if (status !== "all") {
      where.status = status;
    }

    // Filter by product
    if (productId) {
      where.productId = productId;
    }

    // Filter by rating
    if (rating) {
      if (rating === "low") {
        where.rating = { lte: 2 };
      } else {
        where.rating = parseInt(rating);
      }
    }

    // Search functionality
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get reviews with pagination
    const [reviews, totalCount] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              handle: true,
              imageUrl: true,
              shopifyProductId: true,
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

    // Get status counts
    const statusCounts = await prisma.review.groupBy({
      by: ["status"],
      where: {
        shopId: session.shop,
      },
      _count: {
        status: true,
      },
    });

    const counts = {
      all: totalCount,
      pending: 0,
      published: 0,
      rejected: 0,
    };

    statusCounts.forEach((item) => {
      if (item.status === "pending") counts.pending = item._count.status;
      if (item.status === "published") counts.published = item._count.status;
      if (item.status === "rejected") counts.rejected = item._count.status;
    });

    return Response.json({
      reviews,
      counts,
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
