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
  useFetcher,
  useSearchParams,
  useRevalidator,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { updateProductStats } from "../utils/product-stats.server";

const REVIEWS_PER_PAGE = 25;

// Prevent auto-revalidation when fetchers to EXTERNAL routes (e.g. /api/reviews/import)
// complete. Shopify auth can fail on those auto-revalidation requests.
// Manual revalidation via revalidator.revalidate() is used for post-import refresh.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  currentUrl,
  defaultShouldRevalidate,
}) => {
  // If the form submission was on this very page, always revalidate (bulk actions)
  if (formAction && new URL(formAction, currentUrl).pathname === new URL(currentUrl).pathname) {
    return true;
  }
  // For fetchers targeting other routes (import, reply, update, etc.),
  // skip auto-revalidation — our useEffect calls revalidator.revalidate() manually.
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
    throw e; // re-throw so ErrorBoundary still catches it — but now we have the log
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

  // Multi-step import state
  type ImportStep = "upload" | "mapping" | "importing";
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

  // App fields definition
  const APP_FIELDS = [
    { key: "rating",       label: "Rating",         required: true,  desc: "Score from 1–5" },
    { key: "handle",       label: "Product Handle",  required: true,  desc: "Product URL handle (e.g. my-product)" },
    { key: "author",       label: "Author",          required: true,  desc: "Customer name" },
    { key: "email",        label: "Email",           required: false, desc: "Customer email address" },
    { key: "title",        label: "Review Title",    required: false, desc: "Short review headline" },
    { key: "content",      label: "Content",         required: false, desc: "Full review text" },
    { key: "images",       label: "Images",          required: false, desc: "Image URL(s), comma-separated" },
    { key: "created_at",   label: "Created At",      required: false, desc: "Date the review was created" },
    { key: "country_code", label: "Country Code",    required: false, desc: "2-letter country code" },
  ] as const;
  type AppFieldKey = typeof APP_FIELDS[number]["key"];

  const [fieldMapping, setFieldMapping] = useState<Record<AppFieldKey, string>>(
    {} as Record<AppFieldKey, string>
  );

  // Auto-mapping: match CSV header to app field key
  const AUTO_MAP: Record<string, AppFieldKey> = {
    // rating
    rating: "rating", Rating: "rating", review_score: "rating", star_rating: "rating",
    // handle
    handle: "handle", Handle: "handle", product_handle: "handle", "product handle": "handle",
    "Product Handle": "handle", product_url: "handle",
    // author
    author: "author", Author: "author", reviewer_name: "author", display_name: "author",
    "Customer Name": "author", customer_name: "author", name: "author",
    // email
    email: "email", Email: "email", reviewer_email: "email", "Customer Email": "email",
    customer_email: "email",
    // title
    title: "title", Title: "title", review_title: "title", "Review Title": "title",
    // content
    content: "content", Content: "content", body: "content", review_body: "content",
    "Review Content": "content", review_content: "content",
    // images
    images: "images", Images: "images", image_url: "images", "Image URL": "images",
    imageUrl: "images", picture_urls: "images", photo_url: "images",
    // created_at
    created_at: "created_at", Created_At: "created_at", "Created At": "created_at",
    review_date: "created_at", createdAt: "created_at", date: "created_at",
    // country_code
    country_code: "country_code", Country_Code: "country_code", country: "country_code",
  };

  const buildAutoMapping = (headers: string[]): Record<AppFieldKey, string> => {
    const mapping: Partial<Record<AppFieldKey, string>> = {};
    for (const h of headers) {
      const appKey = AUTO_MAP[h] ?? AUTO_MAP[h.toLowerCase()];
      if (appKey && !mapping[appKey]) {
        mapping[appKey] = h;
      }
    }
    return mapping as Record<AppFieldKey, string>;
  };

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
    if (!file) return;
    // Parse CSV headers client-side
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const firstLine = text.split("\n")[0] || "";
      // Simple CSV header parse (handles quoted headers)
      const headers: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of firstLine) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === "," && !inQuotes) { headers.push(current.trim()); current = ""; }
        else { current += char; }
      }
      if (current.trim()) headers.push(current.trim());
      setCsvHeaders(headers);
      setFieldMapping(buildAutoMapping(headers));
    };
    reader.readAsText(file);
  };

  const handleModalImport = () => {
    if (!selectedFile) return;
    setImportStep("importing");
    setIsImporting(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("mapping", JSON.stringify(fieldMapping));
    const targetProductId = searchParams.get("productId");
    if (targetProductId) {
      formData.append("targetProductId", targetProductId);
    }

    fetcher.submit(formData, {
      method: "post",
      action: "/api/reviews/import",
      encType: "multipart/form-data",
    });
  };

  const resetImportModal = () => {
    setImportStep("upload");
    setSelectedFile(null);
    setCsvHeaders([]);
    setFieldMapping({} as Record<AppFieldKey, string>);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      setIsImporting(false);

      if (data.success) {
        (document.getElementById("import-modal") as any)?.hidePopover?.();
        resetImportModal();
        if (shopify?.toast?.show) {
          shopify.toast.show(data.message || "Reviews imported successfully");
        }
        setImportShouldRevalidate(true);
      } else {
        // Stay on mapping step so user can fix and retry
        setImportStep("mapping");
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
        heading="Import CSV Editor"
        onClose={resetImportModal}
      >
        {/* ── STEP INDICATOR ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", fontSize: "14px" }}>
          <span style={{ color: importStep !== "upload" ? "#008060" : undefined, fontWeight: importStep === "upload" ? 600 : undefined }}>① Upload file</span>
          <span style={{ color: "#ccc" }}>›</span>
          <span style={{ color: importStep === "mapping" || importStep === "importing" ? "#008060" : "#aaa", fontWeight: importStep === "mapping" ? 600 : undefined }}>② Mapping fields</span>
          <span style={{ color: "#ccc" }}>›</span>
          <span style={{ color: importStep === "importing" ? "#008060" : "#aaa", fontWeight: importStep === "importing" ? 600 : undefined }}>③ Import</span>
        </div>

        {/* ── STEP 1: UPLOAD ── */}
        {importStep === "upload" && (
          <s-stack gap="base">
            <s-text>
              Select a <strong>.csv</strong> file to import reviews. Download the{" "}
              <s-link onClick={() => window.open("/api/reviews/template", "_blank")}>CSV template</s-link>{" "}
              to see the expected format.
            </s-text>
            <s-box
              borderWidth="base"
              borderRadius="base"
              padding="large"
              // @ts-expect-error web component
              style={{ borderStyle: "dashed", textAlign: "center", cursor: "pointer" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <s-stack gap="small" alignItems="center">
                <s-icon type="upload" />
                <s-text>{selectedFile ? selectedFile.name : "Click to choose a CSV file"}</s-text>
                {selectedFile && <s-text color="subdued">{(selectedFile.size / 1024).toFixed(1)} KB</s-text>}
              </s-stack>
            </s-box>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} />
            <s-stack direction="inline" gap="small" justifyContent="end">
              <s-button commandFor="import-modal" command="--hide">Cancel</s-button>
              <s-button
                variant="primary"
                onClick={() => selectedFile && setImportStep("mapping")}
                disabled={!selectedFile}
              >
                Next →
              </s-button>
            </s-stack>
          </s-stack>
        )}

        {/* ── STEP 2: MAPPING ── */}
        {importStep === "mapping" && (
          <s-stack gap="base">
            {/* CSV header chips */}
            <div>
              <s-text><strong>Header columns from CSV</strong></s-text>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {csvHeaders.map((h) => (
                  <span
                    key={h}
                    style={{
                      background: Object.values(fieldMapping).includes(h) ? "#008060" : "#e4e5e7",
                      color: Object.values(fieldMapping).includes(h) ? "#fff" : "#202223",
                      borderRadius: "20px",
                      padding: "4px 12px",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            {/* Auto mapping button */}
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text><strong>Bolt Reviews fields</strong></s-text>
              <s-button
                variant="tertiary"
                onClick={() => setFieldMapping(buildAutoMapping(csvHeaders))}
              >
                ↺ Auto mapping fields
              </s-button>
            </s-stack>

            {/* Mapping table */}
            <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f6f6f7" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>App Field</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>Required</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>CSV Column</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e1e3e5" }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {APP_FIELDS.map((field, i) => (
                    <tr key={field.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1", color: "#008060", fontWeight: 500 }}>
                        {field.label}
                      </td>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1" }}>
                        <span style={{ color: field.required ? "#d72c0d" : "#6d7175", fontSize: "12px", fontWeight: 600 }}>
                          {field.required ? "true" : "false"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1" }}>
                        <select
                          value={fieldMapping[field.key] || ""}
                          onChange={(e) =>
                            setFieldMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: `1px solid ${field.required && !fieldMapping[field.key] ? "#d72c0d" : "#c9cccf"}`,
                            fontSize: "13px",
                            background: "#fff",
                            minWidth: "140px",
                          }}
                        >
                          <option value="">— not mapped —</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "8px 12px", borderBottom: "1px solid #f1f1f1", color: "#6d7175" }}>
                        {field.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <s-stack direction="inline" gap="small" justifyContent="space-between">
              <s-button variant="tertiary" onClick={() => setImportStep("upload")}>← Back</s-button>
              <s-stack direction="inline" gap="small">
                <s-button commandFor="import-modal" command="--hide">Cancel</s-button>
                <s-button
                  variant="primary"
                  onClick={handleModalImport}
                  disabled={
                    APP_FIELDS.filter((f) => f.required).some((f) => !fieldMapping[f.key])
                  }
                >
                  Import →
                </s-button>
              </s-stack>
            </s-stack>
          </s-stack>
        )}

        {/* ── STEP 3: IMPORTING ── */}
        {importStep === "importing" && (
          <s-stack gap="base" alignItems="center">
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
              <s-text><strong>Importing reviews…</strong></s-text>
              <div style={{ marginTop: "8px" }}>
                <s-text color="subdued">Please wait, this may take a moment.</s-text>
              </div>
            </div>
          </s-stack>
        )}
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
          <s-grid slot="filters" gap="small-200" gridTemplateColumns="auto 1fr">
            <s-stack direction="inline" gap="small-200">
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
                      <s-text>{review.title || "(No title)"}</s-text>
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
                      {review.status
                        ? review.status.charAt(0).toUpperCase() + review.status.slice(1)
                        : "Pending"}
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
