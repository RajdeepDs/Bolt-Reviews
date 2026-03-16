import { type LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  addCorsHeaders,
  handleCorsPreFlight,
  checkRateLimit,
  addRateLimitHeaders,
} from "../utils/security.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return handleCorsPreFlight(request);
  }

  const rateLimit = checkRateLimit(request, {
    windowMs: 60000,
    maxRequests: 100,
  });

  if (rateLimit.limited) {
    let response = new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
    return addCorsHeaders(addRateLimitHeaders(response, 0, rateLimit.resetAt, 100), request);
  }

  const url = new URL(request.url);
  const shopifyProductId = url.searchParams.get("productId");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 50);

  if (!shopifyProductId) {
    let response = new Response(JSON.stringify({ error: "Product ID is required" }), { status: 400 });
    return addCorsHeaders(addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, 100), request);
  }

  try {
    const gidFormat = `gid://shopify/Product/${shopifyProductId}`;
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ shopifyProductId: shopifyProductId }, { shopifyProductId: gidFormat }],
      },
      select: { id: true },
    });

    if (!product) {
      let response = Response.json({ questions: [], pagination: { page, limit, total: 0, pages: 0 } });
      return addCorsHeaders(addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, 100), request);
    }

    const where = {
      productId: product.id,
      status: "published", // Only return published / answered questions
    };

    const total = await prisma.question.count({ where });
    const questions = await prisma.question.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        askerName: true,
        content: true,
        merchantAnswer: true,
        answeredAt: true,
        createdAt: true,
      },
    });

    let response = Response.json({
      questions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

    response = addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, 100);
    return addCorsHeaders(response, request);
  } catch (error) {
    let response = Response.json({ error: "Failed to fetch questions" }, { status: 500 });
    return addCorsHeaders(addRateLimitHeaders(response, rateLimit.remaining, rateLimit.resetAt, 100), request);
  }
}
