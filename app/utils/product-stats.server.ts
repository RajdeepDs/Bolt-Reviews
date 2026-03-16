import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

/**
 * Recalculate and update a product's review statistics
 * (average rating and review count) based on published reviews,
 * and sync them to Shopify Metafields.
 */
export async function updateProductStats(productId: string) {
  const stats = await prisma.review.aggregate({
    where: {
      productId,
      status: "published",
    },
    _avg: {
      rating: true,
    },
    _count: {
      id: true,
    },
  });

  const avgRating = stats._avg.rating || 0;
  const reviewCount = stats._count.id;

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      averageRating: avgRating,
      reviewCount: reviewCount,
    },
  });

  // Sync to Shopify Metafields
  try {
    const { admin } = await unauthenticated.admin(product.shopId);
    
    // Ensure product ID is in Global ID format
    const shopifyProductId = product.shopifyProductId.includes("gid://") 
      ? product.shopifyProductId 
      : `gid://shopify/Product/${product.shopifyProductId}`;

    const response = await admin.graphql(
      `#graphql
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              key: "rating",
              namespace: "bolt_reviews",
              ownerId: shopifyProductId,
              type: "number_decimal",
              value: avgRating.toFixed(1)
            },
            {
              key: "review_count",
              namespace: "bolt_reviews",
              ownerId: shopifyProductId,
              type: "number_integer",
              value: reviewCount.toString()
            }
          ]
        }
      }
    );

    const responseJson = await response.json();
    if (responseJson.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error("Metafield sync errors:", responseJson.data.metafieldsSet.userErrors);
    }
  } catch (error) {
    console.error("Failed to sync metafields to Shopify:", error);
  }
}
