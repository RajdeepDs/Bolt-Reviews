import { type LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const rating = url.searchParams.get("rating");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");

  if (!productId) {
    return Response.json({ error: "Product ID is required" }, { status: 400 });
  }

  try {
    const where: {
      productId: string;
      status: string;
      rating?: number;
    } = {
      productId,
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
          customerEmail: true,
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

    return Response.json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return Response.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

export async function action({ request }: LoaderFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const productId = formData.get("productId") as string;
    const shopId = formData.get("shopId") as string;
    const rating = parseInt(formData.get("rating") as string);
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const customerName = formData.get("customerName") as string;
    const customerEmail = formData.get("customerEmail") as string;
    const isVerified = formData.get("verified") === "true";

    if (
      !productId ||
      !shopId ||
      !rating ||
      !title ||
      !content ||
      !customerName
    ) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    let imageUrl: string | null = null;
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("photo") && value instanceof File) {
        const buffer = await value.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const dataUrl = `data:${value.type};base64,${base64}`;
        imageUrl = dataUrl;
        break;
      }
    }

    const review = await prisma.review.create({
      data: {
        productId,
        shopId,
        rating,
        title,
        content,
        customerName,
        customerEmail,
        isVerified,
        imageUrl,
        status: "pending",
        helpful: 0,
        notHelpful: 0,
      },
    });

    return Response.json({
      success: true,
      review,
      message: "Review submitted successfully and is pending approval",
    });
  } catch (error) {
    console.error("Error creating review:", error);
    return Response.json({ error: "Failed to submit review" }, { status: 500 });
  }
}
