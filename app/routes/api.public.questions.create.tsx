import { type ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
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
    const content = formData.get("content") as string;
    const askerName = formData.get("askerName") as string;
    const askerEmail = formData.get("askerEmail") as string;

    if (!shopifyProductId || !content || !askerName || !askerEmail) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Find product
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
        title: true,
      },
    });

    if (!product) {
      return Response.json(
        { error: "Product not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const settings = await prisma.settings.findUnique({
      where: { shopId: product.shopId },
    });

    // Spam Checking
    const filter = new Filter();
    let status = "pending";
    const isSpam = filter.isProfane(content) || filter.isProfane(askerName);

    if (isSpam) {
      status = "rejected";
    }

    const question = await prisma.question.create({
      data: {
        productId: product.id,
        shopId: product.shopId,
        askerName,
        askerEmail,
        content,
        status,
      },
    });

    // Notify Admin
    if (settings?.emailNotifications && status !== "rejected") {
      const adminEmail = settings.notificationEmail || "admin@example.com";
      sendEmail({
        to: adminEmail,
        subject: `New Question for ${product.title}`,
        html: `
          <h2>New Customer Question Received</h2>
          <p><strong>Product:</strong> ${product.title}</p>
          <p><strong>Asker:</strong> ${askerName} (${askerEmail})</p>
          <p><strong>Question:</strong> ${content}</p>
          <br/>
          <p><em>Please reply via your Shopify Admin app dashboard.</em></p>
        `,
      }).catch(err => console.error(err));
    }

    return Response.json(
      { success: true, message: "Question submitted successfully!" },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Error creating question:", error);
    return Response.json(
      { error: "Failed to submit question" },
      { status: 500, headers: corsHeaders },
    );
  }
}
