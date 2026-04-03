import { useState, useEffect, useRef, useCallback } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useSearchParams,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { updateProductStats } from "../utils/product-stats.server";

import { Card, Text } from "@shopify/polaris";

import ReviewsEmptyState from "../components/reviews-empty-state";
import ReviewsTable from "../components/reviews-table";
import ReviewImportModal from "../components/reviews-import-modal";
import ReviewDetailModal from "../components/reviews-detail-modal";
import type { Review } from "../utils/reviews-types";

const REVIEWS_PER_PAGE = 25;

// Prevent auto-revalidation when fetchers to EXTERNAL routes (e.g. /api/reviews/import)
// complete. Shopify auth can fail on those auto-revalidation requests.
// Manual revalidation via revalidator.revalidate() is used for post-import refresh.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  currentUrl,
  defaultShouldRevalidate,
}) => {
  if (formAction && new URL(formAction, currentUrl).pathname === new URL(currentUrl).pathname) {
    return true;
  }
  if (formAction && formAction !== currentUrl.pathname) {
    return false;
  }
  return defaultShouldRevalidate;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const sort = url.searchParams.get("sort") || "newest";
  const productId = url.searchParams.get("productId") || "";

  const where: any = {
    shopId: session.shop,
  };

  if (status === "pending") {
    where.status = "pending";
  } else if (status === "published") {
    where.status = "published";
  } else if (status === "low") {
    where.rating = { lte: 3 };
  }

  if (productId) {
    where.productId = productId;
  }

  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  let orderBy: any = { createdAt: "desc" };
  switch (sort) {
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "rating-high":
      orderBy = { rating: "desc" };
      break;
    case "rating-low":
      orderBy = { rating: "asc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  let filterProductName: string | null = null;
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { title: true },
    });
    filterProductName = product?.title || null;
  }

  let reviews: any[] = [];
  let totalFiltered = 0;
  let statusCounts: any[] = [];

  try {
    [reviews, totalFiltered, statusCounts] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              handle: true,
              imageUrl: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * REVIEWS_PER_PAGE,
        take: REVIEWS_PER_PAGE,
      }),
      prisma.review.count({ where }),
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
  } catch (e) {
    console.error("[reviews loader] DB query failed:", e);
    throw e;
  }

  const counts = {
    all: 0,
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
  counts.all = counts.pending + counts.published + counts.rejected;

  return {
    reviews,
    counts,
    totalFiltered,
    page,
    totalPages: Math.ceil(totalFiltered / REVIEWS_PER_PAGE),
    filterProductName,
  };
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

        return { success: true, message: `Published ${ids.length} review(s)` };

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
              unpublishedReviews.map(
                (r: { productId: string }) => r.productId,
              ),
            ),
          ];

          for (const productId of unpublishProductIds) {
            await updateProductStats(productId);
          }
        }
        return {
          success: true,
          message: `Unpublished ${ids.length} review(s)`,
        };

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
        return { success: true, message: `Deleted ${ids.length} review(s)` };
    }

    return { success: true };
  } catch (error) {
    console.error("Action error:", error);
    return { success: false, error: (error as Error).message };
  }
};

export default function ReviewsIndex() {
  const { reviews, counts, totalFiltered, page, totalPages, filterProductName } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";
  const isLoading = navigation.state === "loading";

  const [selectedReviews, setSelectedReviews] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || "",
  );
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);

  const currentFilter = searchParams.get("status") || "all";

  // ── Filter / Search / Pagination handlers ────────────────
  const setFilter = useCallback(
    (status: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("status", status);
      params.delete("page");
      setSearchParams(params);
      setSelectedReviews([]);
    },
    [searchParams, setSearchParams],
  );

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      params.delete("page");
      setSearchParams(params);
    }, 400);
  };

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    setSearchParams(params);
    setSelectedReviews([]);
  };

  // ── Selection handlers ───────────────────────────────────
  const toggleSelectAll = (e: any) => {
    e?.preventDefault?.();
    if (selectedReviews.length === reviews.length && reviews.length > 0) {
      setSelectedReviews([]);
    } else {
      setSelectedReviews(reviews.map((r: any) => r.id));
    }
  };

  const toggleReview = (id: string) => {
    setSelectedReviews((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  // ── Bulk actions ─────────────────────────────────────────
  const handleBulkAction = (actionType: string) => {
    const formData = new FormData();
    formData.append("actionType", actionType);
    formData.append("reviewIds", JSON.stringify(selectedReviews));
    submit(formData, { method: "post" });
    setSelectedReviews([]);
  };

  // Toast after bulk actions
  const prevNavigationState = useRef(navigation.state);
  useEffect(() => {
    if (
      prevNavigationState.current === "submitting" &&
      navigation.state === "idle"
    ) {
      const shopify = (window as any).shopify;
      if (shopify?.toast?.show) {
        shopify.toast.show("Action completed successfully");
      }
    }
    prevNavigationState.current = navigation.state;
  }, [navigation.state]);

  const publishableCount = selectedReviews.filter((id) => {
    const review = reviews.find((r: any) => r.id === id);
    return review && review.status !== "published";
  }).length;

  const unpublishableCount = selectedReviews.filter((id) => {
    const review = reviews.find((r: any) => r.id === id);
    return review?.status === "published";
  }).length;

  // ── Export ───────────────────────────────────────────────
  const handleExport = async () => {
    const shopify = (window as any).shopify;
    if (shopify?.toast?.show) {
      shopify.toast.show("Exporting reviews...");
    }

    try {
      const productId = searchParams.get("productId");
      const url = productId ? `/api/reviews/export?productId=${productId}` : "/api/reviews/export";

      const response = await fetch(url);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const tstamp = new Date().toISOString().split("T")[0];
      a.download = productId ? `reviews-product-${tstamp}.csv` : `reviews-all-${tstamp}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      a.remove();

      if (shopify?.toast?.show) {
        shopify.toast.show("Export downloaded!");
      }
    } catch (e) {
      if (shopify?.toast?.show) {
        shopify.toast.show("Failed to export reviews", { isError: true });
      }
    }
  };

  // ── Review detail modal ──────────────────────────────────
  const openReviewDetail = (review: Review) => {
    setSelectedReview(review);
    setTimeout(() => {
      (document.getElementById("review-detail-modal-trigger") as HTMLButtonElement)?.click();
    }, 0);
  };

  const closeReviewDetail = () => {
    (document.getElementById("review-detail-modal-close") as HTMLButtonElement)?.click();
    setSelectedReview(null);
  };

  // ── Product filter ───────────────────────────────────────
  const clearProductFilter = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("productId");
    params.delete("page");
    setSearchParams(params);
  };

  return (
    <s-page heading="My Reviews" inlineSize="base">
      <div style={{ marginBottom: "20px" }}>
        <Card padding="400">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "#F4F0FD",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8B5CF6",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <Text as="span" variant="bodyMd" fontWeight="bold">
                  How's your experience with Bolt Reviews?
                </Text>
                <Text as="span" variant="bodyMd" tone="subdued">
                  Your feedback helps us improve the app.
                </Text>
              </div>
              <div style={{ display: "flex", gap: "4px", cursor: "pointer", marginLeft: "8px" }}>
                {[1, 2, 3].map((i) => (
                  <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="#5C5F62" stroke="#5C5F62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                ))}
                {[4, 5].map((i) => (
                  <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5C5F62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                ))}
              </div>
            </div>
            
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#5C5F62", display: "flex" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1.5"></circle>
                <circle cx="19" cy="12" r="1.5"></circle>
                <circle cx="5" cy="12" r="1.5"></circle>
              </svg>
            </button>
          </div>
        </Card>
      </div>

      {selectedReviews.length === 0 && (
        <s-button slot="primary-action" commandFor="import-modal">Import reviews (CSV)</s-button>
      )}

      <ReviewImportModal />

      {selectedReviews.length === 0 && (
        <s-button slot="secondary-actions" commandFor="more-actions-id">
          More actions
        </s-button>
      )}
      <s-menu id="more-actions-id">
        <s-button onClick={handleExport}>Export reviews (CSV)</s-button>
        <s-button
          onClick={() => window.open("/api/reviews/template", "_blank")}
        >
          Download CSV Template
        </s-button>
      </s-menu>

      {/* Bulk actions */}
      {selectedReviews.length > 0 && (
        <>
          {publishableCount > 0 && (
            <s-button
              slot="primary-action"
              onClick={() => handleBulkAction("publish")}
              disabled={isSubmitting}
            >
              Publish ({publishableCount})
            </s-button>
          )}

          {unpublishableCount > 0 && (
            <s-button
              slot={publishableCount > 0 ? "secondary-actions" : "primary-action"}
              onClick={() => handleBulkAction("unpublish")}
              disabled={isSubmitting}
            >
              Unpublish ({unpublishableCount})
            </s-button>
          )}

          <s-button
            slot="secondary-actions"
            tone="critical"
            onClick={() => handleBulkAction("delete")}
            disabled={isSubmitting}
          >
            Delete ({selectedReviews.length})
          </s-button>
        </>
      )}

      {/* Product filter chip */}
      {filterProductName && (
        <s-section padding="none">
          <s-box padding="base">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text>Filtered by product:</s-text>
              <s-badge tone="info">{filterProductName}</s-badge>
              <s-button variant="tertiary" onClick={clearProductFilter}>
                ✕ Clear filter
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* Main content: empty state or table */}
      {counts.all === 0 ? (
        <ReviewsEmptyState />
      ) : (
        <ReviewsTable
          reviews={reviews as unknown as Review[]}
          counts={counts as any}
          totalFiltered={totalFiltered}
          page={page}
          totalPages={totalPages}
          currentFilter={currentFilter}
          searchQuery={searchQuery}
          selectedReviews={selectedReviews}
          isLoading={isLoading}
          onFilterChange={setFilter}
          onSearchChange={handleSearchChange}
          onToggleSelectAll={toggleSelectAll}
          onToggleReview={toggleReview}
          onOpenReviewDetail={openReviewDetail}
          onGoToPage={goToPage}
        />
      )}

      {/* Hidden trigger buttons */}
      <div style={{ display: "none" }}>
        <s-button id="review-detail-modal-trigger" commandFor="review-detail-modal">Open</s-button>
        <s-button id="review-detail-modal-close" commandFor="review-detail-modal" command="--hide">Close</s-button>
        <s-button id="import-modal-close" commandFor="import-modal" command="--hide">Close</s-button>
      </div>

      <ReviewDetailModal
        selectedReview={selectedReview as Review | null}
        onClose={closeReviewDetail}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
