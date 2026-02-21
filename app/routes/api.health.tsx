import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    // Get counts
    const [productCount, reviewCount, settingsCount] = await Promise.all([
      prisma.product.count(),
      prisma.review.count(),
      prisma.settings.count(),
    ]);

    return Response.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
      counts: {
        products: productCount,
        reviews: reviewCount,
        settings: settingsCount,
      },
    });
  } catch (error) {
    return Response.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
};
