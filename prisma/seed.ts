import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString =
  process.env.DATABASE_URL || "postgresql://localhost:5432/bolt_reviews_dev";

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Create a test shop
  const shopId = "test-shop.myshopify.com";

  // Create test products
  const product1 = await prisma.product.upsert({
    where: {
      shopId_shopifyProductId: {
        shopId: shopId,
        shopifyProductId: "8368668836023",
      },
    },
    update: {},
    create: {
      shopifyProductId: "8368668836023",
      shopId: shopId,
      title: "Short T-Shirt",
      handle: "short-t-shirt",
      imageUrl: "https://cdn.shopify.com/example.jpg",
      reviewCount: 5,
      averageRating: 4.2,
    },
  });

  const product2 = await prisma.product.upsert({
    where: {
      shopId_shopifyProductId: {
        shopId: shopId,
        shopifyProductId: "gid://shopify/Product/1234567890",
      },
    },
    update: {},
    create: {
      shopifyProductId: "gid://shopify/Product/1234567890",
      shopId: shopId,
      title: "Test Product",
      handle: "test-product",
      imageUrl: "https://cdn.shopify.com/example2.jpg",
      reviewCount: 3,
      averageRating: 4.5,
    },
  });

  console.log("✅ Created products:", product1.title, product2.title);

  // Create test reviews for product1
  const reviews = [
    {
      productId: product1.id,
      shopId: shopId,
      customerName: "John Doe",
      customerEmail: "john@example.com",
      rating: 5,
      title: "Excellent product!",
      content:
        "This t-shirt exceeded my expectations. The quality is outstanding and the fit is perfect. Highly recommend!",
      status: "published",
      isVerified: true,
      helpful: 12,
      notHelpful: 1,
    },
    {
      productId: product1.id,
      shopId: shopId,
      customerName: "Jane Smith",
      customerEmail: "jane@example.com",
      rating: 4,
      title: "Good quality",
      content:
        "Really nice t-shirt. The fabric is soft and comfortable. Only minor issue is that it's slightly smaller than expected, but overall very happy with the purchase.",
      status: "published",
      isVerified: true,
      helpful: 8,
      notHelpful: 0,
    },
    {
      productId: product1.id,
      shopId: shopId,
      customerName: "Mike Johnson",
      customerEmail: "mike@example.com",
      rating: 5,
      title: "Love it!",
      content:
        "Perfect t-shirt for everyday wear. Washes well and maintains its shape. I've already ordered two more in different colors!",
      status: "published",
      isVerified: false,
      helpful: 15,
      notHelpful: 2,
    },
    {
      productId: product1.id,
      shopId: shopId,
      customerName: "Sarah Williams",
      customerEmail: "sarah@example.com",
      rating: 3,
      title: "It's okay",
      content:
        "The t-shirt is decent but nothing special. The color is nice but the fabric feels a bit thin. For the price, I expected better quality.",
      status: "published",
      isVerified: true,
      helpful: 5,
      notHelpful: 3,
    },
    {
      productId: product1.id,
      shopId: shopId,
      customerName: "David Brown",
      customerEmail: "david@example.com",
      rating: 5,
      title: "Best t-shirt ever!",
      content:
        "I've been searching for the perfect t-shirt and this is it! The fit is amazing, the quality is top-notch, and it's incredibly comfortable. Worth every penny!",
      status: "published",
      isVerified: true,
      helpful: 20,
      notHelpful: 0,
    },
  ];

  for (const reviewData of reviews) {
    await prisma.review.create({
      data: reviewData,
    });
  }

  console.log(`✅ Created ${reviews.length} reviews for ${product1.title}`);

  // Create test reviews for product2
  const reviews2 = [
    {
      productId: product2.id,
      shopId: shopId,
      customerName: "Emily Davis",
      customerEmail: "emily@example.com",
      rating: 5,
      title: "Fantastic!",
      content: "Absolutely love this product. Great quality and fast shipping!",
      status: "published",
      isVerified: true,
      helpful: 7,
      notHelpful: 0,
    },
    {
      productId: product2.id,
      shopId: shopId,
      customerName: "Chris Wilson",
      customerEmail: "chris@example.com",
      rating: 4,
      title: "Pretty good",
      content:
        "Good product overall. Does what it's supposed to do. Minor packaging issue but the product itself is fine.",
      status: "published",
      isVerified: false,
      helpful: 4,
      notHelpful: 1,
    },
    {
      productId: product2.id,
      shopId: shopId,
      customerName: "Anna Martinez",
      customerEmail: "anna@example.com",
      rating: 5,
      title: "Highly recommended",
      content:
        "This is my second purchase and I'm just as happy as the first time. Consistent quality and excellent customer service.",
      status: "published",
      isVerified: true,
      helpful: 10,
      notHelpful: 0,
    },
  ];

  for (const reviewData of reviews2) {
    await prisma.review.create({
      data: reviewData,
    });
  }

  console.log(`✅ Created ${reviews2.length} reviews for ${product2.title}`);

  // Update product review counts and averages
  await prisma.product.update({
    where: { id: product1.id },
    data: {
      reviewCount: reviews.length,
      averageRating:
        reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length,
    },
  });

  await prisma.product.update({
    where: { id: product2.id },
    data: {
      reviewCount: reviews2.length,
      averageRating:
        reviews2.reduce((sum, r) => sum + r.rating, 0) / reviews2.length,
    },
  });

  console.log("✅ Updated product statistics");

  // Create default settings
  await prisma.settings.upsert({
    where: { shopId: shopId },
    update: {},
    create: {
      shopId: shopId,
      autoPublish: false,
      requireModeration: true,
      allowGuestReviews: true,
      requireVerifiedPurchase: false,
      minRatingToPublish: 1,
      enableReviewImages: true,
      emailNotifications: true,
      notificationEmail: "admin@test-shop.com",
    },
  });

  console.log("✅ Created default settings");

  console.log("🎉 Seeding completed successfully!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Error during seeding:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
