import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};
const dummyReviews = [
  {
    id: "1",
    author: "Amelia",
    rating: 5,
    title: "Height and Posture Boost in Weeks",
    content:
      "These gummies are delicious and surprisingly effective. Friends started asking what our secret is.",
    product: "Nourae™ Viral Heightener Gummies",
    date: "2026-01-12",
    hasImage: true,
    status: "published",
  },
  {
    id: "2",
    author: "Mira",
    rating: 2,
    title: "Packaging was damaged",
    content:
      "Product works but packaging arrived broken. Please improve shipping.",
    product: "Posture Corrector Pro",
    date: "2026-01-10",
    hasImage: false,
    status: "pending",
  },
];
function renderStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export default function ReviewsIndex() {
  return (
    <s-page heading="Reviews" inlineSize="base">
      <s-section padding="none">
        <s-table>
          {/* FILTER BAR */}
          <s-grid
            slot="filters"
            gap="base"
            gridTemplateColumns="auto 1fr"
            alignItems="center"
          >
            <s-stack direction="inline" gap="small-200">
              <s-button variant="secondary">All</s-button>
              <s-button variant="tertiary">Pending</s-button>
              <s-button variant="tertiary">Low ratings</s-button>
              <s-button variant="tertiary">With images</s-button>
            </s-stack>

            <s-text-field
              label="Search reviews"
              labelAccessibilityVisibility="exclusive"
              icon="search"
              placeholder="Search reviews"
            />
          </s-grid>

          {/* TABLE HEADER */}
          <s-table-header-row>
            <s-table-header listSlot="primary">Review</s-table-header>
            <s-table-header>Rating</s-table-header>
            <s-table-header>Product</s-table-header>
            <s-table-header>Created</s-table-header>
            <s-table-header listSlot="secondary">Status</s-table-header>
            <s-table-header format="numeric">Actions</s-table-header>
          </s-table-header-row>

          {/* TABLE BODY */}
          <s-table-body>
            {dummyReviews.map((review) => (
              <s-table-row key={review.id}>
                {/* REVIEW CELL */}
                <s-table-cell>
                  <s-stack gap="small">
                    <s-text fontWeight="semibold">{review.author}</s-text>
                    <s-text>{review.title}</s-text>
                    <s-text tone="subdued" size="small">
                      {review.content}
                    </s-text>
                  </s-stack>
                </s-table-cell>

                {/* RATING */}
                <s-table-cell>
                  <s-text tone={review.rating <= 2 ? "critical" : "default"}>
                    {renderStars(review.rating)}
                  </s-text>
                </s-table-cell>

                {/* PRODUCT */}
                <s-table-cell>
                  <s-text tone="subdued">{review.product}</s-text>
                </s-table-cell>

                {/* DATE */}
                <s-table-cell>
                  <s-text tone="subdued">{review.date}</s-text>
                </s-table-cell>

                {/* STATUS */}
                <s-table-cell>
                  <s-badge
                    tone={
                      review.status === "published" ? "success" : "attention"
                    }
                  >
                    {review.status === "published" ? "Published" : "Pending"}
                  </s-badge>
                </s-table-cell>

                {/* ACTIONS */}
                <s-table-cell>
                  <s-stack direction="inline" gap="small">
                    <s-button size="small" variant="secondary">
                      Reply
                    </s-button>
                    <s-button size="small" variant="secondary" tone="critical">
                      Delete
                    </s-button>
                  </s-stack>
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
