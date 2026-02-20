import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

const dummyProducts = [
  {
    id: "1",
    name: "Nourae™ Viral Heightener Gummies",
    averageRating: 4.8,
    totalReviews: 105,
    pendingReviews: 15,
    status: "active",
  },
  {
    id: "2",
    name: "Posture Corrector Pro",
    averageRating: 4.3,
    totalReviews: 28,
    pendingReviews: 2,
    status: "active",
  },
  {
    id: "3",
    name: "Joint Support Capsules",
    averageRating: 0,
    totalReviews: 0,
    pendingReviews: 0,
    status: "inactive",
  },
];
export default function ProductsIndex() {
  return (
    <s-page heading="Products" inlineSize="base">
      <s-section padding="none">
        <s-table>
          {/* Header Row */}
          <s-table-header-row>
            <s-table-header listSlot="primary">Product</s-table-header>
            <s-table-header>Average Rating</s-table-header>
            <s-table-header>Total Reviews</s-table-header>
            <s-table-header>Pending</s-table-header>
            <s-table-header listSlot="secondary">Status</s-table-header>
          </s-table-header-row>

          {/* Body */}
          <s-table-body>
            {dummyProducts.map((product) => (
              <s-table-row key={product.id}>
                {/* Product Name */}
                <s-table-cell>
                  <s-link href={`/app/reviews?product=${product.id}`}>
                    {product.name}
                  </s-link>
                </s-table-cell>

                {/* Average Rating */}
                <s-table-cell>
                  {product.totalReviews > 0 ? (
                    <s-text>{product.averageRating.toFixed(1)} ★</s-text>
                  ) : (
                    <s-text tone="subdued">—</s-text>
                  )}
                </s-table-cell>

                {/* Total Reviews */}
                <s-table-cell>{product.totalReviews}</s-table-cell>

                {/* Pending Reviews */}
                <s-table-cell>
                  {product.pendingReviews > 0 ? (
                    <s-badge tone="attention">{product.pendingReviews}</s-badge>
                  ) : (
                    <s-text tone="subdued">0</s-text>
                  )}
                </s-table-cell>

                {/* Status */}
                <s-table-cell>
                  <s-badge
                    tone={product.status === "active" ? "success" : "neutral"}
                  >
                    {product.status === "active" ? "Active" : "Inactive"}
                  </s-badge>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
