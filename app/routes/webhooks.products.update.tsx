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
      handle: string;
      image?: { src: string };
    };

    // Update product in database
    await prisma.product.upsert({
      where: {
        shopId_shopifyProductId: {
          shopId: shop,
          shopifyProductId: product.admin_graphql_api_id,
        },
      },
      update: {
        title: product.title,
        handle: product.handle,
        imageUrl: product.image?.src || null,
      },
      create: {
        shopifyProductId: product.admin_graphql_api_id,
        shopId: shop,
        title: product.title,
        handle: product.handle,
        imageUrl: product.image?.src || null,
        reviewCount: 0,
        averageRating: 0,
      },
    });

    console.log(`✅ Product ${product.title} updated in database`);
  } catch (error) {
    console.error("Error processing product update webhook:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response("Webhook processed", { status: 200 });
};
