import { useState } from "react";
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

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export default function ReviewsIndex() {
  const [selectedReviews, setSelectedReviews] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "low" | "pending">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredReviews = dummyReviews.filter((review) => {
    // Apply filter
    let matchesFilter = true;
    if (filter === "low") matchesFilter = review.rating <= 2;
    if (filter === "pending") matchesFilter = review.status === "pending";

    // Apply search
    const matchesSearch =
      searchQuery === "" ||
      review.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.product.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const toggleSelectAll = () => {
    if (selectedReviews.length === filteredReviews.length) {
      setSelectedReviews([]);
    } else {
      setSelectedReviews(filteredReviews.map((r) => r.id));
    }
  };

  const toggleReview = (id: string) => {
    setSelectedReviews((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handlePublishSelected = () => {
    // Only publish pending reviews
    const pendingToPublish = selectedReviews.filter((id) => {
      const review = dummyReviews.find((r) => r.id === id);
      return review?.status === "pending";
    });

    if (pendingToPublish.length === 0) {
      console.log("No pending reviews to publish");
      // You can show a toast message here
      return;
    }

    console.log("Publishing pending reviews:", pendingToPublish);
    // Add your publish logic here
    setSelectedReviews([]);
  };

  const handleUnpublishSelected = () => {
    // Only unpublish published reviews
    const publishedToUnpublish = selectedReviews.filter((id) => {
      const review = dummyReviews.find((r) => r.id === id);
      return review?.status === "published";
    });

    if (publishedToUnpublish.length === 0) {
      console.log("No published reviews to unpublish");
      return;
    }

    console.log("Unpublishing reviews:", publishedToUnpublish);
    // Add your unpublish logic here
    setSelectedReviews([]);
  };

  // Count how many selected reviews are pending
  const selectedPendingCount = selectedReviews.filter((id) => {
    const review = dummyReviews.find((r) => r.id === id);
    return review?.status === "pending";
  }).length;

  // Count how many selected reviews are published
  const selectedPublishedCount = selectedReviews.filter((id) => {
    const review = dummyReviews.find((r) => r.id === id);
    return review?.status === "published";
  }).length;

  return (
    <s-page heading="My Reviews" inlineSize="base">
      {selectedReviews.length > 0 && (
        <>
          {selectedPendingCount > 0 && (
            <s-button slot="primary-action" onClick={handlePublishSelected}>
              Publish ({selectedPendingCount})
            </s-button>
          )}
          <s-button
            slot="secondary-actions"
            tone="critical"
            onClick={() => setSelectedReviews([])}
          >
            Delete
          </s-button>
          {selectedPublishedCount > 0 && (
            <s-button
              slot={
                selectedPendingCount > 0
                  ? "secondary-actions"
                  : "primary-action"
              }
              onClick={handleUnpublishSelected}
            >
              Unpublish ({selectedPublishedCount})
            </s-button>
          )}
        </>
      )}
      <s-section padding="none">
        {/* FILTER BUTTONS */}
        <s-table>
          <s-grid slot="filters" gap="small-200" gridTemplateColumns="auto 1fr">
            <s-stack direction="inline">
              <s-button
                variant={filter === "all" ? "secondary" : "tertiary"}
                onClick={() => setFilter("all")}
              >
                All
              </s-button>
              <s-button
                variant={filter === "low" ? "secondary" : "tertiary"}
                onClick={() => setFilter("low")}
              >
                Low ratings
              </s-button>
              <s-button
                variant={filter === "pending" ? "secondary" : "tertiary"}
                onClick={() => setFilter("pending")}
              >
                Pending
              </s-button>
            </s-stack>
            <s-text-field
              label="Search reviews"
              labelAccessibilityVisibility="exclusive"
              icon="search"
              placeholder="Searching all reviews"
              value={searchQuery}
              onInput={(e) => setSearchQuery(e.target?.value)}
            />
          </s-grid>
          {/* TABLE HEADER */}
          <s-table-header-row>
            <s-table-header>
              <s-checkbox
                checked={
                  selectedReviews.length === filteredReviews.length &&
                  filteredReviews.length > 0
                }
                onInput={toggleSelectAll}
              />
            </s-table-header>
            <s-table-header listSlot="primary">Customer</s-table-header>
            <s-table-header>Title</s-table-header>
            <s-table-header format="numeric">Rating</s-table-header>
            <s-table-header>Product</s-table-header>
            <s-table-header>Date</s-table-header>
            <s-table-header listSlot="secondary">Status</s-table-header>
          </s-table-header-row>

          {/* TABLE BODY */}
          <s-table-body>
            {filteredReviews.map((review) => (
              <s-table-row key={review.id}>
                {/* CHECKBOX */}
                <s-table-cell>
                  <s-checkbox
                    checked={selectedReviews.includes(review.id)}
                    onInput={() => toggleReview(review.id)}
                  />
                </s-table-cell>

                {/* CUSTOMER */}
                <s-table-cell>
                  <s-text>{review.author}</s-text>
                </s-table-cell>

                {/* TITLE */}
                <s-table-cell>
                  <s-stack gap="small">
                    <s-text>{review.title}</s-text>
                  </s-stack>
                </s-table-cell>

                {/* RATING */}
                <s-table-cell>
                  <s-text>{review.rating} stars</s-text>
                </s-table-cell>

                {/* PRODUCT */}
                <s-table-cell>
                  <s-text>{review.product}</s-text>
                </s-table-cell>

                {/* DATE */}
                <s-table-cell>
                  <s-text>{formatDate(review.date)}</s-text>
                </s-table-cell>

                {/* STATUS */}
                <s-table-cell>
                  <s-badge
                    tone={review.status === "published" ? "success" : "warning"}
                  >
                    {review.status === "published" ? "Published" : "Pending"}
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
