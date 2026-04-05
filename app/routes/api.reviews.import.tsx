import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { updateProductStats } from "../utils/product-stats.server";

/**
 * CSV Import — uses explicit field mapping sent from client.
 *
 * Required form fields:
 *   file    — the .csv file
 *   mapping — JSON string like:
 *     {
 *       "rating":       "Rating",         // CSV column for rating (1-5)
 *       "handle":       "handle",         // CSV column for product handle
 *       "author":       "Customer Name",  // CSV column for customer name
 *       "email":        "Customer Email", // (optional) CSV column for email
 *       "title":        "Review Title",   // (optional)
 *       "content":      "content",        // (optional)
 *       "images":       "images",         // (optional) image URL(s)
 *       "created_at":   "Created At",     // (optional)
 *       "country_code": "country_code"    // (optional, stored but unused)
 *     }
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingRaw = formData.get("mapping") as string | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return Response.json(
        { error: "Invalid file type. Please upload a CSV file." },
        { status: 400 },
      );
    }

    // Optional: target product to assign rows when their handle doesn't match
    const targetProductId = formData.get("targetProductId") as string | null;

    // Parse explicit field mapping from client
    let fieldMapping: Record<string, string> = {};
    if (mappingRaw) {
      try {
        fieldMapping = JSON.parse(mappingRaw);
      } catch {
        return Response.json(
          { error: "Invalid mapping configuration." },
          { status: 400 },
        );
      }
    }

    // Validate required fields are mapped
    const requiredFields = ["rating", "handle", "author"];
    const missingFields = requiredFields.filter((f) => !fieldMapping[f]);
    if (missingFields.length > 0) {
      const labels: Record<string, string> = {
        rating: "Rating",
        handle: "Product Handle",
        author: "Author",
      };
      return Response.json(
        {
          error: `Required fields not mapped: ${missingFields.map((f) => labels[f]).join(", ")}. Please go back and map all required fields.`,
        },
        { status: 400 },
      );
    }

    // Read file content
    const content = await file.text();
    const lines = content.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      return Response.json(
        { error: "CSV file is empty or has no data rows." },
        { status: 400 },
      );
    }

    // Parse CSV headers
    const headers = parseCSVRow(lines[0]).map((h) =>
      h.trim().replace(/^"|"$/g, ""),
    );
    const rows = lines.slice(1);

    // Build column-index lookup from the field mapping
    // fieldMapping[appField] = csvColumnName
    const colIndex: Record<string, number> = {};
    for (const [appField, csvCol] of Object.entries(fieldMapping)) {
      const idx = headers.indexOf(csvCol);
      colIndex[appField] = idx; // -1 if column not found (optional fields)
    }

    // Validate that required columns exist in the CSV
    for (const req of requiredFields) {
      if (colIndex[req] === -1) {
        return Response.json(
          {
            error: `Mapped column "${fieldMapping[req]}" not found in CSV. Please re-check your mapping.`,
          },
          { status: 400 },
        );
      }
    }

    const get = (row: string[], appField: string): string | undefined => {
      const idx = colIndex[appField];
      if (idx === undefined || idx === -1) return undefined;
      return row[idx]?.trim() || undefined;
    };

    let importedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const values = parseCSVRow(rows[i]);

        // Skip empty rows
        if (values.every((v) => !v.trim())) continue;

        // Rating
        const ratingStr = get(values, "rating") || "";
        const rating = parseInt(ratingStr);
        if (isNaN(rating) || rating < 1 || rating > 5) {
          skippedCount++;
          errors.push(
            `Row ${i + 2}: Invalid rating "${ratingStr}" (must be 1-5)`,
          );
          continue;
        }

        // Product handle
        let productHandle = get(values, "handle") || "";
        // Extract handle if full URL provided (Yotpo style)
        if (productHandle.includes("/products/")) {
          productHandle =
            productHandle.split("/products/").pop()?.split("?")[0] ||
            productHandle;
        }
        if (!productHandle) {
          skippedCount++;
          errors.push(`Row ${i + 2}: Missing product handle`);
          continue;
        }

        // Customer name
        const customerName = get(values, "author") || "Anonymous";

        // Optional fields
        const customerEmail = get(values, "email") || null;
        const title = get(values, "title") || "(No title)";
        const content = get(values, "content") || "";

        // Date — always use today's date for imported reviews
        const createdAtDate = new Date();

        // Images — support comma-separated URLs or JSON array format
        const rawImages = get(values, "images") || "";
        const imageUrls: string[] = [];
        if (rawImages) {
          // Try JSON array first  ["url1","url2"]
          if (rawImages.trim().startsWith("[")) {
            try {
              const arr = JSON.parse(rawImages);
              if (Array.isArray(arr)) imageUrls.push(...arr.filter(Boolean));
            } catch {
              // Fallback to comma-separated
              imageUrls.push(
                ...rawImages
                  .split(",")
                  .map((u) => u.trim().replace(/^"|"$/g, ""))
                  .filter(Boolean),
              );
            }
          } else {
            imageUrls.push(
              ...rawImages
                .split(",")
                .map((u) => u.trim().replace(/^"|"$/g, ""))
                .filter(Boolean),
            );
          }
        }
        const imageUrl = imageUrls[0] || null;
        const images = imageUrls;

        // Find product — first by handle, then fall back to the target product
        let product = await prisma.product.findFirst({
          where: { handle: productHandle, shopId: session.shop },
        });

        if (!product) {
          // If a target product was explicitly specified, reassign to it
          if (targetProductId) {
            product = await prisma.product.findFirst({
              where: { id: targetProductId, shopId: session.shop },
            });
          }
          if (!product) {
            skippedCount++;
            errors.push(
              `Row ${i + 2}: Product with handle "${productHandle}" not found. ` +
                `Filter by the target product before importing to auto-assign unmatched rows.`,
            );
            continue;
          }
        }

        // Determine status
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

        // Create review
        await prisma.review.create({
          data: {
            productId: product.id,
            shopId: session.shop,
            customerName,
            customerEmail,
            rating,
            title,
            content,
            status,
            isVerified: false,
            helpful: 0,
            notHelpful: 0,
            imageUrl,
            images,
            createdAt: createdAtDate,
          },
        });

        importedCount++;

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
      errors: errors.slice(0, 10),
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

// Helper: parse one CSV row (handles quoted values with commas)
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
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}
