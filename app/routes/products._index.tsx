import { useState, useEffect, useRef } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  useLoaderData,
  useFetcher,
  useSearchParams,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import ProductsTable from "../components/products-table";
import DevelopmentStoreBanner from "../components/development-store-banner";

const PRODUCTS_PER_PAGE = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const search = url.searchParams.get("search") || "";

  const where: any = {
    shopId: session.shop,
  };

  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }

  // Get total count
  const totalCount = await prisma.product.count({ where });

  // Get products with pagination
  const products = await prisma.product.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * PRODUCTS_PER_PAGE,
    take: PRODUCTS_PER_PAGE,
  });

  // Get pending review counts for each product
  const productsWithPending = await Promise.all(
    products.map(async (product: any) => {
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

  // Check subscription status
  const settings = await prisma.settings.findUnique({
    where: { shopId: session.shop },
  });
  const hasActiveSubscription =
    (settings as any)?.subscriptionStatus === "active";

  return {
    products: productsWithPending,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / PRODUCTS_PER_PAGE),
    hasActiveSubscription,
  };
};

export default function ProductsIndex() {
  const { products, totalCount, page, totalPages, hasActiveSubscription } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSyncing, setIsSyncing] = useState(false);

  const isLoading = navigation.state === "loading";

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || "",
  );

  const handleSync = async () => {
    setIsSyncing(true);
    fetcher.submit({}, { method: "post", action: "/api/products/sync" });
  };

  // Reset syncing state when fetcher completes
  useEffect(() => {
    if (isSyncing && fetcher.state === "idle" && fetcher.data) {
      setIsSyncing(false);
      const data = fetcher.data as {
        success?: boolean;
        message?: string;
      };
      if (data?.success) {
        (window as any).shopify?.toast?.show(
          data.message || "Products synced successfully",
        );
      }
    }
  }, [isSyncing, fetcher.state, fetcher.data]);

  // Pagination & Search
  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    setSearchParams(params);
  };

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

  return (
    <>
      <DevelopmentStoreBanner hasActiveSubscription={hasActiveSubscription} />
      <s-page heading="Products" inlineSize="base">
        <s-button
          slot="primary-action"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing..." : "Sync Products"}
        </s-button>

        <ProductsTable
          products={products}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          searchQuery={searchQuery}
          isLoading={isLoading}
          onSearchChange={handleSearchChange}
          onGoToPage={goToPage}
        />
      </s-page>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
