import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-react-router/server";
import type { BillingConfigSubscriptionLineItemPlan } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Plan names - exported for use in billing routes
export const PLAN_BASIC = "Basic";
export const PLAN_PRO = "Pro";
export const PLAN_ELITE = "Elite";

// Billing configuration with lineItems format
const BILLING_CONFIG: Record<string, BillingConfigSubscriptionLineItemPlan> = {
  [PLAN_BASIC]: {
    lineItems: [
      {
        amount: 4.99,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
    trialDays: 0,
  },
  [PLAN_PRO]: {
    lineItems: [
      {
        amount: 7.99,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
    trialDays: 0,
  },
  [PLAN_ELITE]: {
    lineItems: [
      {
        amount: 12.99,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
    trialDays: 0,
  },
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: BILLING_CONFIG,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log(`✅ App installed on shop: ${session.shop}`);

      try {
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
        for (const edge of allProducts) {
          const product = edge.node;

          await prisma.product.upsert({
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
          syncedCount++;
        }

        console.log(`✅ Synced ${syncedCount} products for ${session.shop}`);
      } catch (error) {
        console.error(`❌ Error in afterAuth hook:`, error);
        // Don't throw - we don't want to block app installation if sync fails
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
