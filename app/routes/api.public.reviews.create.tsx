import { type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { updateProductStats } from "../utils/product-stats.server";
import { unauthenticated } from "../shopify.server";
import { Filter } from "bad-words";
import { sendEmail } from "../utils/email.server";

export async function action({ request }: ActionFunctionArgs) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const formData = await request.formData();
    const shopifyProductId = formData.get("productId") as string;
    const rating = parseInt(formData.get("rating") as string);
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const customerName = formData.get("customerName") as string;
    const customerEmail = formData.get("customerEmail") as string;
    let isVerified = formData.get("verified") === "true";

    if (!shopifyProductId || !rating || !title || !content || !customerName) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Find the product by Shopify product ID - check both formats (numeric and GID)
    const gidFormat = `gid://shopify/Product/${shopifyProductId}`;
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { shopifyProductId: shopifyProductId },
          { shopifyProductId: gidFormat },
        ],
      },
      select: {
        id: true,
        shopId: true,
        shopifyProductId: true,
        title: true,
      },
    });

    if (!product) {
      return Response.json(
        { error: "Product not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Handle single image upload via Cloudinary (1 image per review)
    let imageFile: File | null = null;
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("photo") && value instanceof File && value.size > 0) {
        imageFile = value;
        break; // Only take the first image
      }
    }

    let imageUrl: string | null = null;
    const images: string[] = [];

    if (imageFile) {
      try {
        const { uploadSingleImage } = await import("../utils/cloudinary.server");
        const url = await uploadSingleImage(imageFile);
        imageUrl = url;
        images.push(url);
      } catch (error) {
        console.error("Failed to upload review image:", error);
        // Continue creating the review without the image
      }
    }

    // Determine review status based on shop settings
    const settings = await prisma.settings.findUnique({
      where: { shopId: product.shopId },
    });

    let status = "pending"; // Default: require moderation

    // Spam & Profanity Auto-Moderation
    const filter = new Filter();
    const isSpam = filter.isProfane(title) || filter.isProfane(content);

    if (isSpam) {
      status = "rejected";
      console.log(`Auto-rejected review for profanity: ${customerEmail || customerName}`);
    } else if (settings?.autoPublish) {
      if (rating >= (settings.minRatingToPublish || 1)) {
        status = "published";
      }
    }

    // Duplicate review prevention
    if (customerEmail) {
      const existingReview = await prisma.review.findFirst({
        where: {
          shopId: product.shopId,
          productId: product.id,
          customerEmail: customerEmail,
        },
      });

      if (existingReview) {
        return Response.json(
          { error: "You have already reviewed this product" },
          { status: 409, headers: corsHeaders },
        );
      }

      // Verified Purchase Auto-Detection
      if (!isVerified) {
        try {
          const { admin } = await unauthenticated.admin(product.shopId);
          // Query recent orders for this email
          const query = `
            query CheckCustomerOrders($query: String!) {
              orders(first: 10, query: $query) {
                edges {
                  node {
                    lineItems(first: 50) {
                      edges {
                        node {
                          product {
                            id
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `;
          const response = await admin.graphql(query, { 
            variables: { query: `email:${customerEmail}` }
          });
          const data = await response.json();
          
          let foundPurchase = false;
          const orders = data?.data?.orders?.edges || [];
          
          for (const orderEdge of orders) {
            const lineItems = orderEdge.node?.lineItems?.edges || [];
            for (const itemEdge of lineItems) {
              const orderedProductId = itemEdge.node?.product?.id;
              if (orderedProductId) {
                // shopifyProductId might be standard or GID format, check both
                if (orderedProductId === product.shopifyProductId || product.shopifyProductId.endsWith(orderedProductId.split('/').pop() || '')) {
                  foundPurchase = true;
                  break;
                }
              }
            }
            if (foundPurchase) break;
          }
          
          if (foundPurchase) {
            isVerified = true;
            console.log(`Auto-verified purchase for ${customerEmail} on product ${product.id}`);
          }
        } catch (error) {
          console.error("Failed to auto-verify purchase:", error);
        }
      }
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        productId: product.id,
        shopId: product.shopId,
        rating,
        title,
        content,
        customerName,
        customerEmail: customerEmail || null,
        isVerified,
        imageUrl,
        images,
        status,
        helpful: 0,
        notHelpful: 0,
      },
    });

    // Update product statistics only if published
    if (status === "published") {
      await updateProductStats(product.id);
    }

    // Trigger Admin Email Notification
    if (settings?.emailNotifications) {
      const adminEmail = settings.notificationEmail || "admin@example.com";
      const subject = `New ${rating}-star review for ${product.title}`;
      const statusText = status === "published" ? "and was auto-published" : "and requires moderation";
      const html = `
        <h2>New Review Received</h2>
        <p><strong>Product:</strong> ${product.title}</p>
        <p><strong>Customer:</strong> ${customerName} (${customerEmail || "No email"})</p>
        <p><strong>Rating:</strong> ${rating}/5 Stars</p>
        <p><strong>Title:</strong> ${title}</p>
        <p><strong>Review:</strong> ${content}</p>
        <br/>
        <p><em>This review is currently marked as <strong>${status}</strong> ${statusText}.</em></p>
      `;

      // Don't wait for email to send before returning the frontend response
      sendEmail({
        to: adminEmail,
        subject,
        html,
      }).catch(err => console.error("Failed to send review notification email:", err));
    }

    return Response.json(
      {
        success: true,
        review,
        message:
          status === "published"
            ? "Review submitted and published successfully!"
            : "Review submitted successfully! It will appear after moderation.",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error creating review:", error);
    return Response.json(
      { error: "Failed to submit review" },
      { status: 500, headers: corsHeaders },
    );
  }
}
