import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  IndexFilters,
  useSetIndexFiltersMode,
  Card,
  IndexTable,
  Text,
  Badge,
  Thumbnail,
  Button,
  Tooltip
} from "@shopify/polaris";
import { ImageIcon, ViewIcon } from "@shopify/polaris-icons";
import type { IndexFiltersProps, TabProps } from "@shopify/polaris";

export default function ProductsTable({
  products,
  totalCount,
  page,
  totalPages,
  searchQuery,
  isLoading,
  onSearchChange,
  onGoToPage,
}: any) {
  const { mode, setMode } = useSetIndexFiltersMode();
  const navigate = useNavigate();

  const tabs: TabProps[] = [
    { id: "all", content: "All" },
  ];
  const selected = 0;

  const sortOptions: IndexFiltersProps['sortOptions'] = [
    { label: 'Date', value: 'date desc', directionLabel: 'Newest' },
  ];
  const [sortSelected, setSortSelected] = useState(['date desc']);

  const primaryAction: IndexFiltersProps['primaryAction'] = {
    type: 'save',
    onAction: async () => true,
    disabled: false,
    loading: false,
  };

  const rowMarkup = products.map((product: any, index: number) => {
    return (
      <IndexTable.Row
        id={product.id}
        key={product.id}
        position={index}
      >
        <IndexTable.Cell>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Thumbnail
              source={product.imageUrl || ImageIcon}
              alt={product.title}
              size="small"
            />
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {product.title}
            </Text>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {product.reviewCount > 0 ? (
            <Text as="span" variant="bodyMd">{product.averageRating.toFixed(1)}</Text>
          ) : (
            <Text as="span" tone="subdued">—</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd">{product.reviewCount}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {product.pendingReviews > 0 ? (
            <Badge tone="warning">{product.pendingReviews}</Badge>
          ) : (
            <Text as="span" variant="bodyMd">0</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Tooltip content="View reviews">
            <Button
              onClick={() => navigate(`/reviews?productId=${product.id}`)}
              icon={ViewIcon}
              variant="tertiary"
            />
          </Tooltip>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card padding="0">
      <IndexFilters
        sortOptions={sortOptions}
        sortSelected={sortSelected}
        queryValue={searchQuery}
        queryPlaceholder="Search products"
        onQueryChange={onSearchChange}
        onQueryClear={() => onSearchChange('')}
        onSort={setSortSelected}
        primaryAction={primaryAction}
        cancelAction={{
          onAction: () => { },
          disabled: false,
          loading: false,
        }}
        tabs={tabs}
        selected={selected}
        onSelect={() => { }}
        canCreateNewView={false}
        filters={[]}
        appliedFilters={[]}
        onClearAll={() => { }}
        mode={mode}
        setMode={setMode}
        loading={isLoading}
      />
      <IndexTable
        resourceName={{ singular: "product", plural: "products" }}
        itemCount={products.length}
        selectable={false}
        pagination={{
          hasNext: page < totalPages,
          hasPrevious: page > 1,
          onNext: () => onGoToPage(page + 1),
          onPrevious: () => onGoToPage(page - 1)
        }}
        headings={[
          { title: "Product" },
          { title: "Average Rating" },
          { title: "Total Reviews" },
          { title: "Pending" },
          { title: "Actions" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}
