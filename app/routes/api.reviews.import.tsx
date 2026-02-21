import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * CSV Import Format:
 *
 * Required Headers:
 * - Product Handle: The product URL handle (e.g., "my-product-name")
 * - Customer Name: Name of the reviewer
 * - Rating: Number between 1-5
 * - Review Title: Short review headline
 * - Review Content: Full review text
 *
 * Optional Headers:
 * - Customer Email: Reviewer's email address
 * - Status: "pending", "published", or "rejected" (default: auto based on settings)
 * - Verified Purchase: "Yes" or "No" (default: No)
 * - Helpful Votes: Number of helpful votes (default: 0)
 * - Not Helpful Votes: Number of not helpful votes (default: 0)
 * - Image URL: URL to review image
 *
 * Note: Product must exist in database before importing reviews
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return Response.json(
        { error: "Invalid file type. Please upload a CSV file." },
        { status: 400 },
      );
    }

    // Read file content
    const content = await file.text();
    const lines = content.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      return Response.json(
        { error: "CSV file is empty or invalid" },
        { status: 400 },
      );
    }

    // Parse CSV
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1);

    // Validate required headers
    const requiredHeaders = [
      "Product Handle",
      "Customer Name",
      "Rating",
      "Review Title",
      "Review Content",
    ];

    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      return Response.json(
        {
          error: `Missing required headers: ${missingHeaders.join(", ")}`,
        },
        { status: 400 },
      );
    }

    let importedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const values = parseCSVRow(row);

        if (values.length !== headers.length) {
          skippedCount++;
          errors.push(`Row ${i + 2}: Column count mismatch`);
          continue;
        }

        // Map values to object
        const reviewData: Record<string, string> = {};
        headers.forEach((header, index) => {
          reviewData[header] = values[index];
        });

        // Validate rating
        const rating = parseInt(reviewData["Rating"]);
        if (isNaN(rating) || rating < 1 || rating > 5) {
          skippedCount++;
          errors.push(`Row ${i + 2}: Invalid rating (must be 1-5)`);
          continue;
        }

        // Find product by handle
        const product = await prisma.product.findFirst({
          where: {
            handle: reviewData["Product Handle"],
            shopId: session.shop,
          },
        });

        if (!product) {
          skippedCount++;
          errors.push(
            `Row ${i + 2}: Product with handle "${reviewData["Product Handle"]}" not found`,
          );
          continue;
        }

        // Get settings to determine default status
        const settings = await prisma.settings.findUnique({
          where: { shopId: session.shop },
        });

        let status = "pending";
        if (
          settings?.autoPublish &&
          rating >= (settings.minRatingToPublish || 1)
        ) {
          status = "published";
        }

        // Override status if provided in CSV
        if (reviewData["Status"]) {
          const csvStatus = reviewData["Status"].toLowerCase();
          if (["pending", "published", "rejected"].includes(csvStatus)) {
            status = csvStatus;
          }
        }

        // Create review
        await prisma.review.create({
          data: {
            productId: product.id,
            shopId: session.shop,
            customerName: reviewData["Customer Name"],
            customerEmail: reviewData["Customer Email"] || null,
            rating,
            title: reviewData["Review Title"],
            content: reviewData["Review Content"],
            status,
            isVerified:
              reviewData["Verified Purchase"]?.toLowerCase() === "yes" ||
              reviewData["Verified Purchase"]?.toLowerCase() === "true",
            helpful: parseInt(reviewData["Helpful Votes"] || "0") || 0,
            notHelpful: parseInt(reviewData["Not Helpful Votes"] || "0") || 0,
            imageUrl: reviewData["Image URL"] || null,
          },
        });

        importedCount++;

        // Update product stats if published
        if (status === "published") {
          await updateProductStats(product.id);
        }
      } catch (error) {
        skippedCount++;
        errors.push(`Row ${i + 2}: ${(error as Error).message}`);
      }
    }

    return Response.json({
      success: true,
      message: `Import complete. Imported ${importedCount} reviews, skipped ${skippedCount}.`,
      imported: importedCount,
      skipped: skippedCount,
      errors: errors.slice(0, 10), // Return first 10 errors
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error("Error importing reviews:", error);
    return Response.json(
      {
        error: "Failed to import reviews",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
};

// Helper function to parse CSV row (handles quoted values with commas)
function parseCSVRow(row: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Add last field
  values.push(current.trim());

  return values;
}

// Helper function to update product stats
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
