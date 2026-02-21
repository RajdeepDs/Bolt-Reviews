import { useState, useEffect } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const rating = url.searchParams.get("rating");

  // Build where clause
  const where: {
    shopId: string;
    status?: string;
    rating?: { lte: number } | number;
    OR?: Array<{
      customerName?: { contains: string; mode: "insensitive" };
      title?: { contains: string; mode: "insensitive" };
      content?: { contains: string; mode: "insensitive" };
    }>;
  } = {
    shopId: session.shop,
  };

  // Filter by status
  if (status !== "all") {
    where.status = status;
  }

  // Filter by rating
  if (rating) {
    if (rating === "low") {
      where.rating = { lte: 2 };
    } else {
      where.rating = parseInt(rating);
    }
  }

  // Search functionality
  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  // Get reviews
  const [reviews, statusCounts] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            title: true,
            handle: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),
    prisma.review.groupBy({
      by: ["status"],
      where: {
        shopId: session.shop,
      },
      _count: {
        status: true,
      },
    }),
  ]);

  const counts = {
    all: reviews.length,
    pending: 0,
    published: 0,
    rejected: 0,
  };

  statusCounts.forEach(
    (item: { status: string; _count: { status: number } }) => {
      if (item.status === "pending") counts.pending = item._count.status;
      if (item.status === "published") counts.published = item._count.status;
      if (item.status === "rejected") counts.rejected = item._count.status;
    },
  );

  return { reviews, counts };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;
  const reviewIds = formData.get("reviewIds") as string;

  const ids = reviewIds ? JSON.parse(reviewIds) : [];

  try {
    switch (actionType) {
      case "publish":
        await prisma.review.updateMany({
          where: {
            id: { in: ids },
            shopId: session.shop,
          },
          data: { status: "published" },
        });

        // Update product stats for affected products
        {
          const publishedReviews = await prisma.review.findMany({
            where: { id: { in: ids } },
            select: { productId: true },
          });
          const productIds = [
            ...new Set(
              publishedReviews.map((r: { productId: string }) => r.productId),
            ),
          ];

          for (const productId of productIds) {
            await updateProductStats(productId);
          }
        }

        break;

      case "unpublish":
        {
          await prisma.review.updateMany({
            where: {
              id: { in: ids },
              shopId: session.shop,
            },
            data: { status: "pending" },
          });

          const unpublishedReviews = await prisma.review.findMany({
            where: { id: { in: ids } },
            select: { productId: true },
          });
          const unpublishProductIds = [
            ...new Set(
              unpublishedReviews.map((r: { productId: string }) => r.productId),
            ),
          ];

          for (const productId of unpublishProductIds) {
            await updateProductStats(productId);
          }
        }
        break;

      case "delete":
        {
          const reviewsToDelete = await prisma.review.findMany({
            where: {
              id: { in: ids },
              shopId: session.shop,
            },
            select: { productId: true },
          });
          const deleteProductIds = [
            ...new Set(
              reviewsToDelete.map((r: { productId: string }) => r.productId),
            ),
          ];

          await prisma.review.deleteMany({
            where: {
              id: { in: ids },
              shopId: session.shop,
            },
          });

          for (const productId of deleteProductIds) {
            await updateProductStats(productId);
          }
        }
        break;
    }

    return { success: true };
  } catch (error) {
    console.error("Action error:", error);
    return { success: false, error: (error as Error).message };
  }
};

async function updateProductStats(productId: string) {
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

  await prisma.product.update({
    where: { id: productId },
    data: {
      averageRating: stats._avg.rating || 0,
      reviewCount: stats._count.id,
    },
  });
}

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
  const { reviews, counts } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedReviews, setSelectedReviews] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "low" | "pending">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Client-side filtering
  const filteredReviews = reviews.filter((review: any) => {
    let matchesFilter = true;
    if (filter === "low") matchesFilter = review.rating <= 2;
    if (filter === "pending") matchesFilter = review.status === "pending";

    const matchesSearch =
      searchQuery === "" ||
      review.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.product.title.toLowerCase().includes(searchQuery.toLowerCase());

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

  const handleBulkAction = (actionType: string) => {
    const formData = new FormData();
    formData.append("actionType", actionType);
    formData.append("reviewIds", JSON.stringify(selectedReviews));

    submit(formData, { method: "post" });
    setSelectedReviews([]);
  };

  // Count how many selected reviews are pending
  const selectedPendingCount = selectedReviews.filter((id) => {
    const review = reviews.find((r: any) => r.id === id);
    return review?.status === "pending";
  }).length;

  // Count how many selected reviews are published
  const selectedPublishedCount = selectedReviews.filter((id) => {
    const review = reviews.find((r: any) => r.id === id);
    return review?.status === "published";
  }).length;

  // Clear selection when submitting completes
  useEffect(() => {
    if (!isSubmitting && selectedReviews.length > 0) {
      setSelectedReviews([]);
    }
  }, [isSubmitting, selectedReviews.length]);

  return (
    <s-page heading="My Reviews" inlineSize="base">
      <s-button slot="secondary-actions" commandFor="more-actions-id">
        More actions
      </s-button>
      <s-menu id="more-actions-id">
        <s-button
          onClick={() =>
            (window as any).shopify?.toast?.show("Coming soon...") ||
            console.log("Coming soon...")
          }
        >
          Import reviews
        </s-button>
        <s-button
          onClick={() =>
            (window as any).shopify?.toast?.show("Coming soon...") ||
            console.log("Coming soon...")
          }
        >
          Export reviews
        </s-button>
      </s-menu>
      {selectedReviews.length > 0 && (
        <>
          {selectedPendingCount > 0 && (
            <s-button
              slot="primary-action"
              onClick={() => handleBulkAction("publish")}
              disabled={isSubmitting}
            >
              Publish ({selectedPendingCount})
            </s-button>
          )}

          <s-button
            slot="secondary-actions"
            tone="critical"
            onClick={() => handleBulkAction("delete")}
            disabled={isSubmitting}
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
              onClick={() => handleBulkAction("unpublish")}
              disabled={isSubmitting}
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
                All ({counts.all})
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
                Pending ({counts.pending})
              </s-button>
            </s-stack>
            <s-text-field
              label="Search reviews"
              labelAccessibilityVisibility="exclusive"
              icon="search"
              placeholder="Search all reviews"
              value={searchQuery}
              onInput={(e: any) => setSearchQuery(e.target?.value || "")}
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
            {filteredReviews.length === 0 ? (
              <s-table-row>
                <s-table-cell>
                  <s-box padding="large">
                    <s-text>
                      {searchQuery || filter !== "all"
                        ? "No reviews found matching your filters"
                        : "No reviews yet. Reviews will appear here once customers start leaving feedback."}
                    </s-text>
                  </s-box>
                </s-table-cell>
              </s-table-row>
            ) : (
              filteredReviews.map((review: any) => (
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
                    <s-text>{review.customerName}</s-text>
                  </s-table-cell>

                  {/* TITLE */}
                  <s-table-cell>
                    <s-stack gap="small">
                      <s-text>{review.title}</s-text>
                    </s-stack>
                  </s-table-cell>

                  {/* RATING */}
                  <s-table-cell>
                    <s-text>{"⭐".repeat(review.rating)}</s-text>
                  </s-table-cell>

                  {/* PRODUCT */}
                  <s-table-cell>
                    <s-text>{review.product.title}</s-text>
                  </s-table-cell>

                  {/* DATE */}
                  <s-table-cell>
                    <s-text>{formatDate(review.createdAt.toString())}</s-text>
                  </s-table-cell>

                  {/* STATUS */}
                  <s-table-cell>
                    <s-badge
                      tone={
                        review.status === "published"
                          ? "success"
                          : review.status === "rejected"
                            ? "critical"
                            : "warning"
                      }
                    >
                      {review.status.charAt(0).toUpperCase() +
                        review.status.slice(1)}
                    </s-badge>
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
