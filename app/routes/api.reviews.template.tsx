import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Generate CSV template with headers and example data
  const csvHeaders = [
    "Product Handle",
    "Customer Name",
    "Customer Email",
    "Rating",
    "Review Title",
    "Review Content",
    "Status",
    "Verified Purchase",
    "Helpful Votes",
    "Not Helpful Votes",
    "Image URL",
  ];

  const exampleRows = [
    [
      "product-handle-1",
      "John Doe",
      "john@example.com",
      "5",
      "Amazing product!",
      "This product exceeded my expectations. Highly recommend it to everyone!",
      "published",
      "Yes",
      "0",
      "0",
      "",
    ],
    [
      "product-handle-2",
      "Jane Smith",
      "jane@example.com",
      "4",
      "Pretty good",
      "Good quality product. Delivery was fast and packaging was secure.",
      "pending",
      "No",
      "0",
      "0",
      "",
    ],
    [
      "product-handle-1",
      "Mike Johnson",
      "",
      "3",
      "It's okay",
      "Average product. Does the job but nothing special.",
      "published",
      "Yes",
      "0",
      "0",
      "",
    ],
  ];

  // Combine headers and example rows
  const csvContent = [
    csvHeaders.join(","),
    ...exampleRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  const filename = "reviews-import-template.csv";

  // Return CSV file
  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
