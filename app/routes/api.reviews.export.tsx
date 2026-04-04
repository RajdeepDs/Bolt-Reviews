import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const status = url.searchParams.get("status") || "all";
    const search = url.searchParams.get("search") || "";
    const ratingFilter = url.searchParams.getAll("rating");

    // Build where clause
    const where: any = {
      shopId: session.shop,
    };

    if (productId) {
      where.productId = productId;
    }

    if (status === "pending") {
      where.status = "pending";
    } else if (status === "published") {
      where.status = "published";
    } else if (status === "low") {
      where.rating = { lte: 3 };
    }

    if (ratingFilter && ratingFilter.length > 0) {
      where.rating = { in: ratingFilter.map((r: string) => parseInt(r)) };
    }

    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    // Fetch all reviews
    const reviews = await prisma.review.findMany({
      where,
      include: {
        product: {
          select: {
            title: true,
            handle: true,
            shopifyProductId: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Generate CSV content
    const csvHeaders = [
      "Review ID",
      "Product Title",
      "Product Handle",
      "Customer Name",
      "Customer Email",
      "Rating",
      "Review Title",
      "Review Content",
      "Status",
      "Verified Purchase",
      "Helpful Votes",
      "Not Helpful Votes",
      "Image URL",
      "Created At",
      "Updated At",
    ];

    const csvRows = reviews.map((review) => [
      review.id,
      `"${review.product.title.replace(/"/g, '""')}"`,
      review.product.handle,
      `"${review.customerName.replace(/"/g, '""')}"`,
      review.customerEmail || "",
      review.rating,
      `"${review.title.replace(/"/g, '""')}"`,
      `"${review.content.replace(/"/g, '""')}"`,
      review.status,
      review.isVerified ? "Yes" : "No",
      review.helpful,
      review.notHelpful,
      review.imageUrl || "",
      review.createdAt.toISOString(),
      review.updatedAt.toISOString(),
    ]);

    // Combine headers and rows
    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.join(",")),
    ].join("\n");

    // Generate filename
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = productId
      ? `reviews-product-${timestamp}.csv`
      : `reviews-all-${timestamp}.csv`;

    // Return CSV file
    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting reviews:", error);
    return Response.json(
      {
        error: "Failed to export reviews",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
};
