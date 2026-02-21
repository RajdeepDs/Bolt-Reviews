import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { assertProductionEnv } from "./env.server";

assertProductionEnv();

// Use DATABASE_URL from Render Postgres, Neon, or any PostgreSQL provider.
// For Neon: use the pooled connection string (recommended for serverless).
const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NODE_ENV === "production") {
  throw new Error(
    "[Production] DATABASE_URL is required. Add it in your Render (or host) environment.",
  );
}

const adapter = new PrismaPg({
  connectionString:
    connectionString || "postgresql://localhost:5432/placeholder",
});
const prisma = new PrismaClient({ adapter });

export default prisma;
