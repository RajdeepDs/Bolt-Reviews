export default function TopProductsTable() {
  const topProducts = [
    {
      id: 1,
      name: "Nourae™ Viral Heightener Gummies",
      averageRating: 4.9,
      totalReviews: 65,
      trend: "+12 this month",
      status: "Active",
      inventory: "65 in stock",
      category: "Health & Wellness",
      channels: 3,
    },
    {
      id: 2,
      name: "Posture Corrector Pro",
      averageRating: 4.7,
      totalReviews: 28,
      trend: "+5 this month",
      status: "Active",
      inventory: "28 in stock",
      category: "Health & Wellness",
      channels: 2,
    },
    {
      id: 3,
      name: "Joint Support Capsules",
      averageRating: 4.3,
      totalReviews: 12,
      trend: "-2 this month",
      status: "Draft",
      inventory: "0 in stock",
      category: "Supplements",
      channels: 1,
    },
  ];

  return (
    <s-box
      padding="none"
      border="base"
      borderRadius="base"
      accessibilityLabel="Top products table section"
    >
      <s-table>
        <s-table-header-row>
          <s-table-header listSlot="primary">Product</s-table-header>
          <s-table-header>Status</s-table-header>
          <s-table-header>Inventory</s-table-header>
          <s-table-header>Category</s-table-header>
          <s-table-header listSlot="secondary">Channels</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {topProducts.map((product) => (
            <s-table-row
              key={product.id}
              clickDelegate={`product-${product.id}-checkbox`}
            >
              <s-table-cell>
                <s-stack direction="inline">
                  <s-checkbox id={`product-${product.id}-checkbox`} />
                  <s-icon type="image" />
                  <s-link href="">{product.name}</s-link>
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <s-badge
                  color="base"
                  tone={product.status === "Active" ? "success" : "neutral"}
                >
                  {product.status}
                </s-badge>
              </s-table-cell>
              <s-table-cell>
                <s-text
                  tone={
                    product.inventory.startsWith("0") ? "critical" : undefined
                  }
                >
                  {product.inventory}
                </s-text>
              </s-table-cell>
              <s-table-cell>{product.category}</s-table-cell>
              <s-table-cell>{product.channels}</s-table-cell>
            </s-table-row>
          ))}
        </s-table-body>
      </s-table>
    </s-box>
  );
}
