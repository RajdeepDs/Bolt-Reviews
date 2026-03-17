import { useState, useEffect, useRef, useCallback } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useFetcher,
  useSearchParams,
  useRevalidator,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { updateProductStats } from "../utils/product-stats.server";

const REVIEWS_PER_PAGE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const sort = url.searchParams.get("sort") || "newest";
  const productId = url.searchParams.get("productId") || "";

  // Build where clause
  const where: any = {
    shopId: session.shop,
  };

  // Filter by status
  if (status === "pending") {
    where.status = "pending";
  } else if (status === "published") {
    where.status = "published";
  } else if (status === "low") {
    where.rating = { lte: 3 };
  }

  // Filter by product
  if (productId) {
    where.productId = productId;
  }

  // Search functionality
  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  // Sort mapping
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

  // Get product name for filter chip
  let filterProductName: string | null = null;
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { title: true },
    });
    filterProductName = product?.title || null;
  }

  // Get reviews with pagination + total counts
  const [reviews, totalFiltered, statusCounts] = await Promise.all([
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
  const { reviews, counts, totalFiltered, page, totalPages, filterProductName } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const updateFetcher = useFetcher();
  const replyFetcher = useFetcher();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";
  const isLoading = navigation.state === "loading";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importModalRef = useRef<HTMLElement>(null);

  const [selectedReviews, setSelectedReviews] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || "",
  );
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importShouldRevalidate, setImportShouldRevalidate] = useState(false);

  // Review detail modal state
  const [selectedReview, setSelectedReview] = useState<
    (typeof reviews)[0] | null
  >(null);
  const [replyText, setReplyText] = useState("");
  const [editForm, setEditForm] = useState({
    title: "",
    content: "",
    rating: 0,
    status: "",
    customerName: "",
    customerEmail: "",
  });

  // Get current filter from URL
  const currentFilter = searchParams.get("status") || "all";

  // Update filter via URL params
  const setFilter = useCallback(
    (status: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("status", status);
      params.delete("page"); // Reset to page 1
      setSearchParams(params);
      setSelectedReviews([]);
    },
    [searchParams, setSearchParams],
  );

  // Handle search debounce
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

  // Pagination
  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    setSearchParams(params);
    setSelectedReviews([]);
  };

  const toggleSelectAll = (e: any) => {
    e?.preventDefault?.();
    if (
      selectedReviews.length === reviews.length &&
      reviews.length > 0
    ) {
      setSelectedReviews([]);
    } else {
      setSelectedReviews(reviews.map((r) => r.id));
    }
  };

  const toggleReview = (id: string) => {
    setSelectedReviews((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleBulkAction = (actionType: string) => {
    const formData = new FormData();
    formData.append("actionType", actionType);
    formData.append("reviewIds", JSON.stringify(selectedReviews));

    submit(formData, { method: "post" });
    setSelectedReviews([]);
  };

  // Show toast after bulk actions complete
  const prevNavigationState = useRef(navigation.state);
  useEffect(() => {
    if (
      prevNavigationState.current === "submitting" &&
      navigation.state === "idle"
    ) {
      const shopify = (window as any).shopify;
      const data = navigation.formData
        ? undefined
        : (undefined as any); // action data is in the loader revalidation
      if (shopify?.toast?.show) {
        shopify.toast.show("Action completed successfully");
      }
    }
    prevNavigationState.current = navigation.state;
  }, [navigation.state]);

  // Count how many selected reviews are pending
  const selectedPendingCount = selectedReviews.filter((id) => {
    const review = reviews.find((r) => r.id === id);
    return review?.status === "pending";
  }).length;

  // Count how many selected reviews are published
  const selectedPublishedCount = selectedReviews.filter((id) => {
    const review = reviews.find((r) => r.id === id);
    return review?.status === "published";
  }).length;

  const handleExport = () => {
    window.open("/api/reviews/export", "_blank");
    const shopify = (window as any).shopify;
    if (shopify?.toast?.show) {
      shopify.toast.show("Exporting reviews...");
    }
  };
  // Import click handled natively by label

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleModalImport = () => {
    if (!selectedFile) return;

    setIsImporting(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    fetcher.submit(formData, {
      method: "post",
      action: "/api/reviews/import",
      encType: "multipart/form-data",
    });
  };

  // Handle import completion
  useEffect(() => {
    if (isImporting && fetcher.state === "idle" && fetcher.data) {
      const data = fetcher.data as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      const shopify = (window as any).shopify;

      // Reset import state
      setIsImporting(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (data.success) {
        // Close modal using the Popover API (how s-modal works under the hood)
        (document.getElementById("import-modal") as any)?.hidePopover?.();
        if (shopify?.toast?.show) {
          shopify.toast.show(data.message || "Reviews imported successfully");
        }
        // Signal the separate revalidation effect instead of calling directly
        setImportShouldRevalidate(true);
      } else {
        if (shopify?.toast?.show) {
          shopify.toast.show(data.error || "Import failed", { isError: true });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImporting, fetcher.state, fetcher.data]);

  // Deferred revalidation — runs after the import completion state updates settle
  useEffect(() => {
    if (importShouldRevalidate) {
      setImportShouldRevalidate(false);
      revalidator.revalidate();
    }
  }, [importShouldRevalidate, revalidator]);

  // --- Review Detail Modal ---
  const openReviewDetail = (review: (typeof reviews)[0]) => {
    setSelectedReview(review);
    setReplyText(review.merchantReply || "");
    setEditForm({
      title: review.title,
      content: review.content,
      rating: review.rating,
      status: review.status,
      customerName: review.customerName,
      customerEmail: review.customerEmail || "",
    });
  };

  const closeReviewDetail = () => {
    setSelectedReview(null);
  };

  const handleSaveReply = () => {
    if (!selectedReview) return;

    replyFetcher.submit(
      JSON.stringify({ reply: replyText }),
      {
        method: "POST",
        action: `/api/reviews/${selectedReview.id}/reply`,
        encType: "application/json",
      },
    );
  };

  // Handle reply completion
  useEffect(() => {
    if (replyFetcher.state === "idle" && replyFetcher.data) {
      const data = replyFetcher.data as { success?: boolean; error?: string };
      const shopify = (window as any).shopify;

      if (data.success) {
        if (shopify?.toast?.show) {
          shopify.toast.show("Reply saved successfully");
        }
        revalidator.revalidate();
      } else {
        if (shopify?.toast?.show) {
          shopify.toast.show(data.error || "Failed to save reply", { isError: true });
        }
      }
    }
  }, [replyFetcher.state, replyFetcher.data, revalidator]);

  // Product filter clear
  const clearProductFilter = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("productId");
    params.delete("page");
    setSearchParams(params);
  };

  // Sort handler
  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("sort", value);
    params.delete("page");
    setSearchParams(params);
  };

  const handleSaveReview = () => {
    if (!selectedReview) return;

    updateFetcher.submit(
      JSON.stringify({
        customerName: editForm.customerName,
        customerEmail: editForm.customerEmail || null,
        rating: editForm.rating,
        title: editForm.title,
        content: editForm.content,
        status: editForm.status,
      }),
      {
        method: "PATCH",
        action: `/api/reviews/${selectedReview.id}/update`,
        encType: "application/json",
      },
    );
  };

  // Handle update completion
  useEffect(() => {
    if (updateFetcher.state === "idle" && updateFetcher.data) {
      const data = updateFetcher.data as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      const shopify = (window as any).shopify;

      if (data.success) {
        if (shopify?.toast?.show) {
          shopify.toast.show("Review updated successfully");
        }
        closeReviewDetail();
        revalidator.revalidate();
      } else {
        if (shopify?.toast?.show) {
          shopify.toast.show(data.error || "Failed to update review", {
            isError: true,
          });
        }
      }
    }
  }, [updateFetcher.state, updateFetcher.data, revalidator]);

  // Pagination info
  const startItem = (page - 1) * REVIEWS_PER_PAGE + 1;
  const endItem = Math.min(page * REVIEWS_PER_PAGE, totalFiltered);

  return (
    <s-page heading="My Reviews" inlineSize="base">
      <s-button slot="primary-action" commandFor="import-modal">Import reviews (CSV)</s-button>
      <s-modal
        id="import-modal"
        // @ts-expect-error web component ref
        ref={importModalRef}
        heading="Import Reviews"
        onClose={() => {
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      >
        <s-stack gap="base">
          <s-text>Select a <strong>.csv</strong> file to import reviews. Download the{" "}
            <s-link onClick={() => window.open("/api/reviews/template", "_blank")}>
              CSV template
            </s-link>{" "}to see the expected format.
          </s-text>

          <s-box
            borderWidth="base"
            borderRadius="base"
            padding="large"
            // @ts-expect-error web component
            style={{
              borderStyle: "dashed",
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <s-stack gap="small" alignItems="center">
              {/* <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>⬆️</span> */}
              <s-icon type="upload" />
              <s-text>
                {selectedFile
                  ? selectedFile.name
                  : "Click to choose a CSV file"}
              </s-text>
              {selectedFile && (
                <s-text color="subdued">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </s-text>
              )}
            </s-stack>
          </s-box>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          <s-stack direction="inline" gap="small" justifyContent="end">
            <s-button
              commandFor="import-modal"
              command="--hide"
              disabled={isImporting}
            >
              Cancel
            </s-button>
            <s-button
              variant="primary"
              onClick={handleModalImport}
              disabled={!selectedFile || isImporting}
            >
              {isImporting ? "Uploading..." : "Upload"}
            </s-button>
          </s-stack>
        </s-stack>
      </s-modal>
      <s-button slot="secondary-actions" commandFor="more-actions-id">
        More actions
      </s-button>
      <s-menu id="more-actions-id">
        <s-button onClick={handleExport}>Export reviews (CSV)</s-button>
        <s-button
          onClick={() => window.open("/api/reviews/template", "_blank")}
        >
          Download CSV Template
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
      {/* Product filter chip */}
      {filterProductName && (
        <s-section padding="none">
          <s-box padding="base">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text>Filtered by product:</s-text>
              <s-badge tone="info">
                {filterProductName}
              </s-badge>
              <s-button variant="tertiary" onClick={clearProductFilter}>
                ✕ Clear filter
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      )}

      <s-section padding="none">
        {/* FILTER BUTTONS + SORT */}
        <s-table>
          <s-grid slot="filters" gap="small-200" gridTemplateColumns="auto auto 1fr">
            <s-stack direction="inline">
              <s-button
                variant={currentFilter === "all" ? "secondary" : "tertiary"}
                onClick={() => setFilter("all")}
              >
                All ({counts.all})
              </s-button>
              <s-button
                variant={currentFilter === "low" ? "secondary" : "tertiary"}
                onClick={() => setFilter("low")}
              >
                Low ratings (≤3★)
              </s-button>
              <s-button
                variant={
                  currentFilter === "pending" ? "secondary" : "tertiary"
                }
                onClick={() => setFilter("pending")}
              >
                Pending ({counts.pending})
              </s-button>
            </s-stack>
            <s-select
              label="Sort by"
              labelAccessibilityVisibility="exclusive"
              value={searchParams.get("sort") || "newest"}
              onInput={(e: any) => handleSortChange(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="rating-high">Rating: high to low</option>
              <option value="rating-low">Rating: low to high</option>
            </s-select>
            <s-text-field
              label="Search reviews"
              labelAccessibilityVisibility="exclusive"
              icon="search"
              placeholder="Search all reviews"
              value={searchQuery}
              onInput={(e: any) => handleSearchChange(e.target?.value || "")}
            />
          </s-grid>
          {/* TABLE HEADER */}
          <s-table-header-row>
            <s-table-header>
              <s-checkbox
                checked={
                  selectedReviews.length === reviews.length &&
                  reviews.length > 0
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
            {isLoading ? (
              <s-table-row>
                <s-table-cell>
                  <s-box padding="large">
                    <s-text>Loading reviews...</s-text>
                  </s-box>
                </s-table-cell>
              </s-table-row>
            ) : reviews.length === 0 ? (
              <s-table-row>
                <s-table-cell>
                  <s-box padding="large">
                    <s-text>
                      {searchQuery || currentFilter !== "all"
                        ? "No reviews found matching your filters"
                        : "No reviews yet. Reviews will appear here once customers start leaving feedback."}
                    </s-text>
                  </s-box>
                </s-table-cell>
              </s-table-row>
            ) : (
              reviews.map((review) => (
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
                    <s-link
                      onClick={(e: any) => {
                        e.preventDefault();
                        openReviewDetail(review);
                      }}
                    >
                      {review.customerName}
                    </s-link>
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
                    <s-stack direction="inline" gap="small" alignItems="center">
                      {review.product.imageUrl && (
                        <s-thumbnail
                          src={review.product.imageUrl}
                          alt={review.product.title}
                          size="small"
                        />
                      )}
                      <s-text>{review.product.title}</s-text>
                    </s-stack>
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

        {/* PAGINATION */}
        {totalPages > 1 && (
          <s-box padding="base">
            <s-stack
              direction="inline"
              gap="base"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-text color="subdued">
                Showing {startItem}–{endItem} of {totalFiltered} reviews
              </s-text>
              <s-stack direction="inline" gap="small">
                <s-button
                  variant="tertiary"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                >
                  ← Previous
                </s-button>
                <s-text>
                  Page {page} of {totalPages}
                </s-text>
                <s-button
                  variant="tertiary"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next →
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        )}
      </s-section>

      {/* REVIEW DETAIL MODAL */}
      {selectedReview && (
        <s-modal
          id="review-detail-modal"
          // @ts-expect-error Shopify web component supports open attribute
          open
          onClose={closeReviewDetail}
          variant="base"
        >
          <s-text slot="title">Review Details</s-text>

          <s-box padding="base">
            <s-stack gap="large">
              {/* Review images */}
              {(selectedReview.images?.length > 0 || selectedReview.imageUrl) && (
                <s-box>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {selectedReview.images?.length > 0
                      ? selectedReview.images.map((img: string, i: number) => (
                        <img
                          key={i}
                          src={img}
                          alt={`Review image ${i + 1}`}
                          style={{
                            width: "120px",
                            height: "120px",
                            borderRadius: "8px",
                            objectFit: "cover",
                            border: "1px solid var(--s-color-border)",
                          }}
                          onClick={() => window.open(img, "_blank")}
                        />
                      ))
                      : selectedReview.imageUrl && (
                        <img
                          src={selectedReview.imageUrl}
                          alt="Review image"
                          style={{
                            width: "120px",
                            height: "120px",
                            borderRadius: "8px",
                            objectFit: "cover",
                            border: "1px solid var(--s-color-border)",
                          }}
                          onClick={() => window.open(selectedReview.imageUrl!, "_blank")}
                        />
                      )}
                  </div>
                </s-box>
              )}

              {/* Product info */}
              <s-stack direction="inline" gap="small" alignItems="center">
                {selectedReview.product.imageUrl && (
                  <s-thumbnail
                    src={selectedReview.product.imageUrl}
                    alt={selectedReview.product.title}
                    size="small"
                  />
                )}
                <s-stack gap="none">
                  <s-text>
                    <strong>{selectedReview.product.title}</strong>
                  </s-text>
                  <s-text color="subdued">
                    Submitted {formatDate(selectedReview.createdAt.toString())}
                  </s-text>
                </s-stack>
              </s-stack>

              <s-divider />

              {/* Customer Name */}
              <s-text-field
                label="Customer Name"
                value={editForm.customerName}
                onInput={(e: any) =>
                  setEditForm((prev) => ({
                    ...prev,
                    customerName: e.target.value,
                  }))
                }
              />

              {/* Customer Email */}
              <s-text-field
                label="Customer Email"
                value={editForm.customerEmail}
                placeholder="No email provided"
                onInput={(e: any) =>
                  setEditForm((prev) => ({
                    ...prev,
                    customerEmail: e.target.value,
                  }))
                }
              />

              {/* Rating */}
              <s-stack gap="small">
                <s-text><strong>Rating</strong></s-text>
                <s-select
                  label="Rating"
                  labelAccessibilityVisibility="exclusive"
                  value={String(editForm.rating)}
                  onInput={(e: any) =>
                    setEditForm((prev) => ({
                      ...prev,
                      rating: parseInt(e.target.value),
                    }))
                  }
                >
                  <option value="5">⭐⭐⭐⭐⭐ (5 stars)</option>
                  <option value="4">⭐⭐⭐⭐ (4 stars)</option>
                  <option value="3">⭐⭐⭐ (3 stars)</option>
                  <option value="2">⭐⭐ (2 stars)</option>
                  <option value="1">⭐ (1 star)</option>
                </s-select>
              </s-stack>

              {/* Status */}
              <s-stack gap="small">
                <s-text><strong>Status</strong></s-text>
                <s-select
                  label="Status"
                  labelAccessibilityVisibility="exclusive"
                  value={editForm.status}
                  onInput={(e: any) =>
                    setEditForm((prev) => ({
                      ...prev,
                      status: e.target.value,
                    }))
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="published">Published</option>
                  <option value="rejected">Rejected</option>
                </s-select>
              </s-stack>

              {/* Title */}
              <s-text-field
                label="Review Title"
                value={editForm.title}
                onInput={(e: any) =>
                  setEditForm((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />

              {/* Content */}
              <s-stack gap="small">
                <s-text><strong>Review Content</strong></s-text>
                <textarea
                  value={editForm.content}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      content: e.target.value,
                    }))
                  }
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--s-color-border, #ccc)",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    resize: "vertical",
                  }}
                />
              </s-stack>

              {/* Verified badge */}
              {selectedReview.isVerified && (
                <s-badge tone="info">✓ Verified Purchase</s-badge>
              )}

              {/* Helpful counts */}
              <s-stack direction="inline" gap="base">
                <s-text color="subdued">
                  👍 {selectedReview.helpful} helpful
                </s-text>
                <s-text color="subdued">
                  👎 {selectedReview.notHelpful} not helpful
                </s-text>
              </s-stack>

              <s-divider />

              {/* Merchant Reply */}
              <s-stack gap="small">
                <s-text><strong>Merchant Reply</strong></s-text>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  placeholder="Write a reply to this review..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--s-color-border, #ccc)",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    resize: "vertical",
                  }}
                />
                <s-stack direction="inline" gap="small">
                  <s-button
                    variant="secondary"
                    onClick={handleSaveReply}
                    disabled={replyFetcher.state !== "idle"}
                  >
                    {replyFetcher.state !== "idle"
                      ? "Saving reply..."
                      : selectedReview.merchantReply
                        ? "Update Reply"
                        : "Save Reply"}
                  </s-button>
                  {replyText && (
                    <s-button
                      variant="tertiary"
                      onClick={() => {
                        setReplyText("");
                        handleSaveReply();
                      }}
                    >
                      Remove Reply
                    </s-button>
                  )}
                </s-stack>
                {selectedReview.merchantReplyAt && (
                  <s-text color="subdued">
                    Last replied: {formatDate(selectedReview.merchantReplyAt.toString())}
                  </s-text>
                )}
              </s-stack>
            </s-stack>
          </s-box>

          <s-box slot="footer" padding="base">
            <s-stack
              direction="inline"
              gap="base"
              justifyContent="space-between"
            >
              <s-button variant="tertiary" onClick={closeReviewDetail}>
                Cancel
              </s-button>
              <s-button
                variant="primary"
                onClick={handleSaveReview}
                disabled={updateFetcher.state !== "idle"}
              >
                {updateFetcher.state !== "idle" ? "Saving..." : "Save Changes"}
              </s-button>
            </s-stack>
          </s-box>
        </s-modal>
      )}
    </s-page>
  );
}

export function ErrorBoundary() {
  return (
    <s-page heading="Reviews">
      <s-box padding="base" borderRadius="base">
        <s-text><strong>Error rendering Reviews</strong></s-text>
        <div style={{ marginTop: '16px' }}>
          <p>An unexpected error occurred while loading the reviews dashboard. Please try refreshing.</p>
        </div>
      </s-box>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
