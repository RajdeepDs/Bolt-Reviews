import { useState, useCallback } from "react";
import { useFetcher, useSearchParams } from "react-router";
import type { Review, StatusCounts } from "../utils/reviews-types";
import {
  IndexFilters,
  useSetIndexFiltersMode,
  ChoiceList,
  RangeSlider,
  TextField,
  LegacyCard,
  Card,
  IndexTable,
  Text,
  Badge,
  Thumbnail,
  Select
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import type { IndexFiltersProps, TabProps } from "@shopify/polaris";

function formatDate(dateString: string | Date) {
  const date = new Date(dateString);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Helper to check for empty values in mock filters
function isEmpty(value: string | any[]) {
  if (Array.isArray(value)) {
    return value.length === 0;
  } else {
    return value === '' || value == null;
  }
}

interface ReviewsTableProps {
  reviews: Review[];
  counts: StatusCounts;
  totalFiltered: number;
  page: number;
  totalPages: number;
  currentFilter: string;
  searchQuery: string;
  selectedReviews: string[];
  isLoading: boolean;
  onFilterChange: (status: string) => void;
  onSearchChange: (value: string) => void;
  onToggleSelectAll: (e: any) => void;
  onToggleReview: (id: string) => void;
  onOpenReviewDetail: (review: Review) => void;
  onGoToPage: (page: number) => void;
  allProducts?: { id: string; title: string }[];
  ratingFilter?: string[];
  onFilterProductChange?: (value: string) => void;
  onFilterRatingChange?: (value: string[]) => void;
}

export default function ReviewsTable({
  reviews,
  counts,
  totalFiltered,
  page,
  totalPages,
  currentFilter,
  searchQuery,
  selectedReviews,
  isLoading,
  onFilterChange,
  onSearchChange,
  onToggleSelectAll,
  onToggleReview,
  onOpenReviewDetail,
  onGoToPage,
  allProducts = [],
  ratingFilter = [],
  onFilterProductChange,
  onFilterRatingChange,
}: ReviewsTableProps) {
  const { mode, setMode } = useSetIndexFiltersMode();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const filterProduct = searchParams.get('productId') || '';

  // Tab setup matching application routing state
  const tabs: TabProps[] = [
    { id: "all", content: `All` },
    { id: "pending", content: `Pending` },
    { id: "published", content: `Published` },
  ];
  const selected = Math.max(0, tabs.findIndex((tab) => tab.id === currentFilter));

  const handleTabSelect = (selectedTabIndex: number) => {
    onFilterChange(tabs[selectedTabIndex].id);
  };

  // Mock Sorting (from snippet)
  const sortOptions: IndexFiltersProps['sortOptions'] = [
    { label: 'Date', value: 'date asc', directionLabel: 'Oldest' },
    { label: 'Date', value: 'date desc', directionLabel: 'Newest' },
    { label: 'Rating', value: 'rating asc', directionLabel: 'Lowest' },
    { label: 'Rating', value: 'rating desc', directionLabel: 'Highest' },
  ];
  const [sortSelected, setSortSelected] = useState(['date desc']);

  // View Filters
  const handleFilterProductRemove = useCallback(() => {
    if (onFilterProductChange) onFilterProductChange('');
  }, [onFilterProductChange]);

  const handleFilterRatingRemove = useCallback(() => {
    if (onFilterRatingChange) onFilterRatingChange([]);
  }, [onFilterRatingChange]);

  const handleFiltersClearAll = useCallback(() => {
    handleFilterProductRemove();
    handleFilterRatingRemove();
  }, [handleFilterProductRemove, handleFilterRatingRemove]);

  const filters = [
    {
      key: 'product',
      label: 'Product',
      filter: (
        <Select
          label="Product"
          labelHidden
          options={[
            { label: 'All Products', value: '' },
            ...allProducts.map(p => ({ label: p.title, value: p.id }))
          ]}
          value={filterProduct}
          onChange={(value) => onFilterProductChange && onFilterProductChange(value)}
        />
      ),
      shortcut: true,
    },
    {
      key: 'rating',
      label: 'Rating',
      filter: (
        <ChoiceList
          title="Rating"
          titleHidden
          choices={[
            { label: '5 Stars', value: '5' },
            { label: '4 Stars', value: '4' },
            { label: '3 Stars', value: '3' },
            { label: '2 Stars', value: '2' },
            { label: '1 Star', value: '1' },
          ]}
          selected={ratingFilter}
          onChange={(value) => onFilterRatingChange && onFilterRatingChange(value)}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters: IndexFiltersProps['appliedFilters'] = [];
  if (!isEmpty(filterProduct)) {
    const matchedProduct = allProducts.find(p => p.id === filterProduct);
    appliedFilters.push({
      key: 'product',
      label: `Product: ${matchedProduct ? matchedProduct.title : filterProduct}`,
      onRemove: handleFilterProductRemove,
    });
  }
  if (!isEmpty(ratingFilter)) {
    appliedFilters.push({
      key: 'rating',
      label: `Rating: ${ratingFilter.join(', ')} Stars`,
      onRemove: handleFilterRatingRemove,
    });
  }

  // Primary action mock
  const onHandleCancel = () => { };
  const onHandleSave = async () => {
    return true;
  };

  const primaryAction: IndexFiltersProps['primaryAction'] = {
    type: 'save',
    onAction: onHandleSave,
    disabled: false,
    loading: false,
  };

  const handleSelectionChange = (
    selectionType: any,
    isSelecting: boolean,
    selection?: any
  ) => {
    if (selectionType === "all" || selectionType === "page") {
      onToggleSelectAll(null);
    } else if (selectionType === "single" && typeof selection === "string") {
      onToggleReview(selection);
    } else if (selectionType === "multi" && Array.isArray(selection)) {
      // Basic fallback for shift+click multi-array if triggered
      selection.forEach((id) => onToggleReview(id as string));
    }
  };

  const rowMarkup = reviews.map((review, index) => {
    const dotColor = review.status === "published" ? "#008060" : "#8C9196";

    return (
      <IndexTable.Row
        id={review.id}
        key={review.id}
        selected={selectedReviews.includes(review.id)}
        position={index}
        onClick={() => onOpenReviewDetail(review)}
      >
        <IndexTable.Cell>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "250px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: dotColor,
                flexShrink: 0,
              }}
            />
            {(() => {
              const src = review.imageUrl || (review.images && review.images.length > 0 ? review.images[0] : null) || review.product?.imageUrl;
              if (src) {
                return (
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--p-border-radius-200)', overflow: 'hidden', border: '1px solid var(--p-color-border-subdued)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--p-color-bg-surface-secondary)' }}>
                    <img 
                      src={src} 
                      alt={review.title || review.product?.title || "Review Image"}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  </div>
                );
              }
              return (
                <Thumbnail source={ImageIcon} alt="Placeholder" size="small" />
              );
            })()}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <s-heading>
                {review.title || "No Title"}
              </s-heading>
              <s-text>
                {review.content.length > 50
                  ? review.content.substring(0, 50) + "..."
                  : review.content}
              </s-text>
            </div>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>{formatDate(review.createdAt)}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" tone="subdued">
            {review.product.title}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" alignment="center">
            {review.rating}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div onClick={(e) => {
            e.stopPropagation();
            const actionType = review.status === "published" ? "unpublish" : "publish";
            fetcher.submit(
              { actionType, reviewIds: JSON.stringify([review.id]) },
              { method: "post" }
            );
          }}>
            <s-switch
              checked={review.status === "published" ? true : undefined}
            />
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <s-section>
      <s-stack gap="small">
        <s-stack
          direction="inline"
          justifyContent="space-between"
          alignItems="center"
        >
          <s-heading>Reviews</s-heading>
          <s-button variant="primary">Import reviews</s-button>
        </s-stack>

        <Card padding="0">
          <IndexFilters
            sortOptions={sortOptions}
            sortSelected={sortSelected}
            queryValue={searchQuery}
            queryPlaceholder="Searching in all"
            onQueryChange={onSearchChange}
            onQueryClear={() => onSearchChange('')}
            onSort={setSortSelected}
            primaryAction={primaryAction}
            cancelAction={{
              onAction: onHandleCancel,
              disabled: false,
              loading: false,
            }}
            tabs={tabs}
            selected={selected}
            onSelect={handleTabSelect}
            canCreateNewView={false}
            filters={filters}
            appliedFilters={appliedFilters}
            onClearAll={handleFiltersClearAll}
            mode={mode}
            setMode={setMode}
          />
          <IndexTable
            resourceName={{ singular: "review", plural: "reviews" }}
            itemCount={reviews.length}
            selectedItemsCount={
              selectedReviews.length === reviews.length && reviews.length > 0
                ? "All"
                : selectedReviews.length
            }
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: "Review" },
              { title: "Created" },
              { title: "Product" },
              { title: "Rating" },
              { title: "Actions" },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      </s-stack>
    </s-section>
  );
}
