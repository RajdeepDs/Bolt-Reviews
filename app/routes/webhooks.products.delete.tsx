import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (!shop || !payload) {
    return new Response("Missing shop or payload", { status: 400 });
  }

  console.log(`Received ${topic} webhook for shop: ${shop}`);

  try {
    const product = payload as {
      id: number;
      admin_graphql_api_id: string;
      title: string;
    };

    // Find the product in our database
    const existingProduct = await prisma.product.findFirst({
      where: {
        shopifyProductId: product.admin_graphql_api_id,
        shopId: shop,
      },
    });

    if (existingProduct) {
      // Delete all reviews associated with this product
      await prisma.review.deleteMany({
        where: {
          productId: existingProduct.id,
        },
      });

      // Delete the product
      await prisma.product.delete({
        where: {
          id: existingProduct.id,
        },
      });

      console.log(
        `✅ Product ${product.title} and its reviews deleted from database`,
      );
    } else {
      console.log(`⚠️ Product ${product.title} not found in database`);
    }
  } catch (error) {
    console.error("Error processing product delete webhook:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response("Webhook processed", { status: 200 });
};
