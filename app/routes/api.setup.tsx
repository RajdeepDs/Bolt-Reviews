import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);

  try {
    console.log(`🔄 Running setup for shop: ${session.shop}`);

    // Initialize default settings for the shop
    const existingSettings = await prisma.settings.findUnique({
      where: { shopId: session.shop },
    });

    if (!existingSettings) {
      await prisma.settings.create({
        data: {
          shopId: session.shop,
          autoPublish: false,
          requireModeration: true,
          allowGuestReviews: true,
          requireVerifiedPurchase: false,
          minRatingToPublish: 1,
          enableReviewImages: true,
          emailNotifications: true,
        },
      });
      console.log(`✅ Created default settings for ${session.shop}`);
    }

    // Sync products from Shopify
    console.log(`🔄 Starting product sync for ${session.shop}...`);
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

      if (products) {
        allProducts.push(...products.edges);
        hasNextPage = products.pageInfo.hasNextPage;
        cursor = products.edges[products.edges.length - 1]?.cursor || null;
      } else {
        break;
      }
    }

    // Store products in database
    let syncedCount = 0;
    let updatedCount = 0;

    for (const edge of allProducts) {
      const product = edge.node;

      const result = await prisma.product.upsert({
        where: {
          shopId_shopifyProductId: {
            shopId: session.shop,
            shopifyProductId: product.id,
          },
        },
        update: {
          title: product.title,
          handle: product.handle,
          imageUrl: product.featuredImage?.url || null,
        },
        create: {
          shopifyProductId: product.id,
          shopId: session.shop,
          title: product.title,
          handle: product.handle,
          imageUrl: product.featuredImage?.url || null,
          reviewCount: 0,
          averageRating: 0,
        },
      });

      // Check if it was created or updated (simple heuristic)
      if (result.createdAt === result.updatedAt) {
        syncedCount++;
      } else {
        updatedCount++;
      }
    }

    console.log(`✅ Setup complete for ${session.shop}`);

    return Response.json({
      success: true,
      message: `Setup complete! Synced ${syncedCount} new products and updated ${updatedCount} existing products.`,
      settings: existingSettings ? "already exists" : "created",
      products: {
        synced: syncedCount,
        updated: updatedCount,
        total: allProducts.length,
      },
    });
  } catch (error) {
    console.error(`❌ Error in setup:`, error);
    return Response.json(
      {
        error: "Setup failed",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
};
