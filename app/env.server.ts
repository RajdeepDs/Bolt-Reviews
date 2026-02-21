/**
 * Production environment validation.
 * Fails fast at server startup if required env vars are missing.
 */
const requiredEnvVars = [
  "DATABASE_URL",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "SCOPES",
] as const;

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing = requiredEnvVars.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `[Production] Missing required environment variables: ${missing.join(", ")}. ` +
        "Set these in your Render (or host) dashboard before starting the app.",
    );
  }
}
