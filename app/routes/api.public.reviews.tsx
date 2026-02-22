import { type LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopifyProductId = url.searchParams.get("productId");
  const rating = url.searchParams.get("rating");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");

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
    // Find the product by Shopify product ID - check both formats (numeric and GID)
    const gidFormat = `gid://shopify/Product/${shopifyProductId}`;
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { shopifyProductId: shopifyProductId },
          { shopifyProductId: gidFormat },
        ],
      },
      select: {
        id: true,
      },
    });

    // If product doesn't exist, return empty reviews
    if (!product) {
      return new Response(
        JSON.stringify({
          reviews: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0,
          },
        }),
        { headers: corsHeaders },
      );
    }

    const where: {
      productId: string;
      status: string;
      rating?: number;
    } = {
      productId: product.id,
      status: "published",
    };

    if (rating) {
      where.rating = parseInt(rating);
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          title: true,
          content: true,
          customerName: true,
          isVerified: true,
          imageUrl: true,
          helpful: true,
          notHelpful: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.review.count({ where }),
    ]);

    return new Response(
      JSON.stringify({
        reviews,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      }),
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch reviews" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
