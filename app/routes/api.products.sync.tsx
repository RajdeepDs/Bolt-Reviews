import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);

  try {
    const allProducts: Array<{
      cursor: string;
      node: {
        id: string;
        title: string;
        handle: string;
        status: string;
        featuredImage?: { url: string };
      };
    }> = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    // Fetch all products using pagination
    while (hasNextPage) {
      const query = `
        query getProducts($cursor: String) {
          products(first: 50, after: $cursor) {
            edges {
              cursor
              node {
                id
                title
                handle
                status
                featuredImage {
                  url
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const response: Response = await admin.graphql(query, {
        variables: { cursor },
      });

      const data: any = await response.json();
      const products: any = data.data?.products;

      if (!products) {
        throw new Error("Failed to fetch products from Shopify");
      }

      allProducts.push(...products.edges);
      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.edges[products.edges.length - 1]?.cursor || null;
    }

    // Store products in database
    let syncedCount = 0;
    let updatedCount = 0;

    for (const edge of allProducts) {
      const product = edge.node;

      // Check if product already exists
      const existingProduct = await prisma.product.findFirst({
        where: {
          shopifyProductId: product.id,
          shopId: session.shop,
        },
      });

      if (existingProduct) {
        // Update existing product
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: {
            title: product.title,
            handle: product.handle,
            imageUrl: product.featuredImage?.url || null,
          },
        });
        updatedCount++;
      } else {
        // Create new product
        await prisma.product.create({
          data: {
            shopifyProductId: product.id,
            shopId: session.shop,
            title: product.title,
            handle: product.handle,
            imageUrl: product.featuredImage?.url || null,
            reviewCount: 0,
            averageRating: 0,
          },
        });
        syncedCount++;
      }
    }

    return Response.json({
      success: true,
      message: `Successfully synced ${syncedCount} new products and updated ${updatedCount} existing products`,
      synced: syncedCount,
      updated: updatedCount,
      total: allProducts.length,
    });
  } catch (error) {
    console.error("Error syncing products:", error);
    return Response.json(
      {
        error: "Failed to sync products",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
};
