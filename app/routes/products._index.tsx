import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Get all products for this shop with their review stats
  const products = await prisma.product.findMany({
    where: {
      shopId: session.shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Get pending review counts for each product
  const productsWithPending = await Promise.all(
    products.map(async (product) => {
      const pendingCount = await prisma.review.count({
        where: {
          productId: product.id,
          status: "pending",
        },
      });

      return {
        ...product,
        pendingReviews: pendingCount,
      };
    }),
  );

  return { products: productsWithPending };
};

export default function ProductsIndex() {
  const { products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    fetcher.submit({}, { method: "post", action: "/api/products/sync" });
  };

  // Reset syncing state when fetcher completes
  if (isSyncing && fetcher.state === "idle") {
    setIsSyncing(false);
    if (fetcher.data?.success) {
      (window as any).shopify?.toast?.show(
        (fetcher.data as any).message || "Products synced successfully",
      );
    }
  }

  return (
    <s-page heading="Products" inlineSize="base">
      <s-button slot="primary-action" onClick={handleSync} disabled={isSyncing}>
        {isSyncing ? "Syncing..." : "Sync Products"}
      </s-button>
      <s-section padding="none">
        <s-table>
          {/* Header Row */}
          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>Average Rating</s-table-header>
            <s-table-header>Total Reviews</s-table-header>
            <s-table-header>Pending</s-table-header>
            <s-table-header listSlot="secondary">Reviews</s-table-header>
          </s-table-header-row>

          {/* Body */}
          <s-table-body>
            {products.length === 0 ? (
              <s-table-row>
                <s-table-cell>
                  <s-box padding="large">
                    <s-stack gap="large">
                      <s-text>
                        No products found. Click Sync Products to import your
                        products from Shopify.
                      </s-text>
                      <s-button onClick={handleSync} disabled={isSyncing}>
                        {isSyncing ? "Syncing..." : "Sync Products Now"}
                      </s-button>
                    </s-stack>
                  </s-box>
                </s-table-cell>
              </s-table-row>
            ) : (
              products.map((product) => (
                <s-table-row key={product.id}>
                  {/* Product Name */}
                  <s-table-cell>
                    <s-stack gap="small">
                      <s-text>{product.title}</s-text>
                    </s-stack>
                  </s-table-cell>

                  {/* Average Rating */}
                  <s-table-cell>
                    {product.reviewCount > 0 ? (
                      <s-stack direction="inline" gap="small">
                        <s-text>{product.averageRating.toFixed(1)}</s-text>
                        <s-text>⭐</s-text>
                      </s-stack>
                    ) : (
                      <s-text>—</s-text>
                    )}
                  </s-table-cell>

                  {/* Total Reviews */}
                  <s-table-cell>
                    <s-text>{product.reviewCount}</s-text>
                  </s-table-cell>

                  {/* Pending Reviews */}
                  <s-table-cell>
                    {product.pendingReviews > 0 ? (
                      <s-badge tone="warning">{product.pendingReviews}</s-badge>
                    ) : (
                      <s-text>0</s-text>
                    )}
                  </s-table-cell>

                  {/* View Reviews Link */}
                  <s-table-cell>
                    <s-link href={`/reviews?productId=${product.id}`}>
                      View reviews
                    </s-link>
                  </s-table-cell>
                </s-table-row>
              ))
            )}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
