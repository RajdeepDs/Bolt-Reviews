import { useState, useCallback } from "react";
import { useFetcher } from "react-router";
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
  Badge
} from "@shopify/polaris";
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
}: ReviewsTableProps) {
  const { mode, setMode } = useSetIndexFiltersMode();

  // Tab setup matching application routing state
  const tabs: TabProps[] = [
    { id: "all", content: `All (${counts.all})` },
    { id: "pending", content: `Pending (${counts.pending})` },
    { id: "published", content: `Published (${counts.published})` },
    { id: "rejected", content: `Rejected (${counts.rejected})` },
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

  // Mock Filters (from snippet, adapted gracefully)
  const [accountStatus, setAccountStatus] = useState<string[] | undefined>(undefined);
  const [moneySpent, setMoneySpent] = useState<[number, number] | undefined>(undefined);
  const [taggedWith, setTaggedWith] = useState('');

  const handleAccountStatusChange = useCallback((value: string[]) => setAccountStatus(value), []);
  const handleMoneySpentChange = useCallback((value: [number, number]) => setMoneySpent(value), []);
  const handleTaggedWithChange = useCallback((value: string) => setTaggedWith(value), []);

  const handleAccountStatusRemove = useCallback(() => setAccountStatus(undefined), []);
  const handleMoneySpentRemove = useCallback(() => setMoneySpent(undefined), []);
  const handleTaggedWithRemove = useCallback(() => setTaggedWith(''), []);

  const handleFiltersClearAll = useCallback(() => {
    handleAccountStatusRemove();
    handleMoneySpentRemove();
    handleTaggedWithRemove();
  }, [handleAccountStatusRemove, handleMoneySpentRemove, handleTaggedWithRemove]);

  const filters = [
    {
      key: 'accountStatus',
      label: 'Account status',
      filter: (
        <ChoiceList
          title="Account status"
          titleHidden
          choices={[
            { label: 'Enabled', value: 'enabled' },
            { label: 'Not invited', value: 'not invited' },
            { label: 'Invited', value: 'invited' },
            { label: 'Declined', value: 'declined' },
          ]}
          selected={accountStatus || []}
          onChange={handleAccountStatusChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: 'taggedWith',
      label: 'Tagged with',
      filter: (
        <TextField
          label="Tagged with"
          value={taggedWith}
          onChange={handleTaggedWithChange}
          autoComplete="off"
          labelHidden
        />
      ),
      shortcut: true,
    },
    {
      key: 'moneySpent',
      label: 'Money spent',
      filter: (
        <RangeSlider
          label="Money spent is between"
          labelHidden
          value={moneySpent || [0, 500]}
          prefix="$"
          output
          min={0}
          max={2000}
          step={1}
          onChange={handleMoneySpentChange}
        />
      ),
    },
  ];

  const appliedFilters: IndexFiltersProps['appliedFilters'] = [];
  if (accountStatus && !isEmpty(accountStatus)) {
    appliedFilters.push({
      key: 'accountStatus',
      label: `Account status: ${accountStatus.join(', ')}`,
      onRemove: handleAccountStatusRemove,
    });
  }
  if (moneySpent) {
    appliedFilters.push({
      key: 'moneySpent',
      label: `Money spent is between $${moneySpent[0]} and $${moneySpent[1]}`,
      onRemove: handleMoneySpentRemove,
    });
  }
  if (!isEmpty(taggedWith)) {
    appliedFilters.push({
      key: 'taggedWith',
      label: `Tagged with ${taggedWith}`,
      onRemove: handleTaggedWithRemove,
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
    const dotColor =
      review.status === "published"
        ? "#3091B2" // Blue-ish
        : review.status === "rejected"
        ? "#D82C0D" // Red-ish
        : "#8C9196"; // Grey for pending

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
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Text as="span" variant="bodyMd" fontWeight="bold">
                {review.title || "No Title"}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {review.content.length > 50
                  ? review.content.substring(0, 50) + "..."
                  : review.content}
              </Text>
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
          <Text as="span" variant="bodyMd">
            {review.rating} / 5
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge
            tone={
              review.status === "published"
                ? "success"
                : review.status === "rejected"
                ? "critical"
                : "info"
            }
          >
            {review.status}
          </Badge>
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
              { title: "Status" },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      </s-stack>
    </s-section>
  );
}
