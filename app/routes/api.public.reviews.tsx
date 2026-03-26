import { type LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  addCorsHeaders,
  handleCorsPreFlight,
  checkRateLimit,
  addRateLimitHeaders,
} from "../utils/security.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight(request);
  }

  // Check rate limit
  const rateLimit = checkRateLimit(request, {
    windowMs: 60000,
    maxRequests: 100,
  });

  if (rateLimit.limited) {
    let response = new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
    response = addRateLimitHeaders(response, 0, rateLimit.resetAt, 100);
    return addCorsHeaders(response, request);
  }

  const url = new URL(request.url);
  const shopifyProductId = url.searchParams.get("productId");
  const shopDomain = url.searchParams.get("shopDomain");
  const rating = url.searchParams.get("rating");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 500); // Allow up to 500 per page for widget client-side pagination

  if (!shopifyProductId && !shopDomain) {
    let response = new Response(
      JSON.stringify({ error: "Either Product ID or Shop Domain is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
    response = addRateLimitHeaders(
      response,
      rateLimit.remaining,
      rateLimit.resetAt,
      100,
    );
    return addCorsHeaders(response, request);
  }

  try {
    let where: any = {
      status: "published",
    };

    if (shopifyProductId) {
      // Find the product by Shopify product ID
      const gidFormat = `gid://shopify/Product/${shopifyProductId}`;
      const product = await prisma.product.findFirst({
        where: {
          OR: [
            { shopifyProductId: shopifyProductId },
            { shopifyProductId: gidFormat },
          ],
        },
        select: { id: true },
      });

      if (!product) {
        let response = new Response(
          JSON.stringify({
            reviews: [],
            pagination: { page, limit, total: 0, pages: 0 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
        response = addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, 100);
        return addCorsHeaders(response, request);
      }
      where.productId = product.id;
    } else if (shopDomain) {
      where.shopId = shopDomain;
      // For global fetch (carousel), usually we just want 5-star or highly rated ones, 
      // but let's let the frontend pass the rating filter.
    }

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
          images: true,
          helpful: true,
          notHelpful: true,
          merchantReply: true,
          merchantReplyAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.review.count({ where }),
    ]);

    let response = new Response(
      JSON.stringify({
        reviews,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
    response = addRateLimitHeaders(
      response,
      rateLimit.remaining,
      rateLimit.resetAt,
      100,
    );
    return addCorsHeaders(response, request);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    let response = new Response(
      JSON.stringify({ error: "Failed to fetch reviews" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
    response = addRateLimitHeaders(
      response,
      rateLimit.remaining,
      rateLimit.resetAt,
      100,
    );
    return addCorsHeaders(response, request);
  }
}
