/**
 * Security utilities for production deployment
 * Adds security headers and CORS configuration
 */

export interface SecurityHeaders {
  "X-Frame-Options": string;
  "X-Content-Type-Options": string;
  "X-XSS-Protection": string;
  "Referrer-Policy": string;
  "Permissions-Policy": string;
  "Strict-Transport-Security"?: string;
  "Content-Security-Policy"?: string;
}

/**
 * Get security headers for response
 * These headers protect against common web vulnerabilities
 */
export function getSecurityHeaders(isProduction = false): SecurityHeaders {
  const headers: SecurityHeaders = {
    // Prevent clickjacking attacks
    "X-Frame-Options": "DENY",

    // Prevent MIME type sniffing
    "X-Content-Type-Options": "nosniff",

    // Enable XSS protection (legacy browsers)
    "X-XSS-Protection": "1; mode=block",

    // Control referrer information
    "Referrer-Policy": "strict-origin-when-cross-origin",

    // Disable unnecessary browser features
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };

  // Add HSTS only in production (requires HTTPS)
  if (isProduction) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  return headers;
}

/**
 * Add security headers to a Response object
 */
export function addSecurityHeaders(
  response: Response,
  customHeaders?: Record<string, string>
): Response {
  const isProduction = process.env.NODE_ENV === "production";
  const securityHeaders = getSecurityHeaders(isProduction);

  // Create new headers object
  const headers = new Headers(response.headers);

  // Add security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    if (value) {
      headers.set(key, value);
    }
  });

  // Add any custom headers
  if (customHeaders) {
    Object.entries(customHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  // Return new response with updated headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * CORS configuration for public API endpoints
 * Allows storefront to call public review APIs
 */
export interface CorsOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_CORS_OPTIONS: CorsOptions = {
  origin: true, // Allow all origins for public APIs
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400, // 24 hours
};

/**
 * Add CORS headers to response
 */
export function addCorsHeaders(
  response: Response,
  request: Request,
  options: CorsOptions = {}
): Response {
  const corsOptions = { ...DEFAULT_CORS_OPTIONS, ...options };
  const headers = new Headers(response.headers);

  // Get origin from request
  const requestOrigin = request.headers.get("Origin");

  // Set Access-Control-Allow-Origin
  if (corsOptions.origin === true) {
    headers.set("Access-Control-Allow-Origin", requestOrigin || "*");
  } else if (typeof corsOptions.origin === "string") {
    headers.set("Access-Control-Allow-Origin", corsOptions.origin);
  } else if (Array.isArray(corsOptions.origin)) {
    if (requestOrigin && corsOptions.origin.includes(requestOrigin)) {
      headers.set("Access-Control-Allow-Origin", requestOrigin);
    }
  }

  // Set other CORS headers
  if (corsOptions.methods) {
    headers.set("Access-Control-Allow-Methods", corsOptions.methods.join(", "));
  }

  if (corsOptions.allowedHeaders) {
    headers.set("Access-Control-Allow-Headers", corsOptions.allowedHeaders.join(", "));
  }

  if (corsOptions.credentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  if (corsOptions.maxAge) {
    headers.set("Access-Control-Max-Age", corsOptions.maxAge.toString());
  }

  // Always set Vary header for proper caching
  headers.set("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreFlight(
  request: Request,
  options: CorsOptions = {}
): Response {
  const corsOptions = { ...DEFAULT_CORS_OPTIONS, ...options };
  const headers = new Headers();

  // Get origin from request
  const requestOrigin = request.headers.get("Origin");

  // Set Access-Control-Allow-Origin
  if (corsOptions.origin === true) {
    headers.set("Access-Control-Allow-Origin", requestOrigin || "*");
  } else if (typeof corsOptions.origin === "string") {
    headers.set("Access-Control-Allow-Origin", corsOptions.origin);
  } else if (Array.isArray(corsOptions.origin)) {
    if (requestOrigin && corsOptions.origin.includes(requestOrigin)) {
      headers.set("Access-Control-Allow-Origin", requestOrigin);
    }
  }

  // Set other CORS headers
  if (corsOptions.methods) {
    headers.set("Access-Control-Allow-Methods", corsOptions.methods.join(", "));
  }

  if (corsOptions.allowedHeaders) {
    headers.set("Access-Control-Allow-Headers", corsOptions.allowedHeaders.join(", "));
  }

  if (corsOptions.credentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  if (corsOptions.maxAge) {
    headers.set("Access-Control-Max-Age", corsOptions.maxAge.toString());
  }

  headers.set("Vary", "Origin");

  return new Response(null, {
    status: 204,
    headers,
  });
}

/**
 * Rate limiting helpers (basic in-memory implementation)
 * For production, consider using Redis or a dedicated service
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Max requests per window
  keyGenerator?: (request: Request) => string;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60000, // 1 minute
  maxRequests: 60, // 60 requests per minute
};

/**
 * Check if request is rate limited
 * Returns remaining requests or -1 if limited
 */
export function checkRateLimit(
  request: Request,
  options: RateLimitOptions = {}
): { limited: boolean; remaining: number; resetAt: number } {
  const opts = { ...DEFAULT_RATE_LIMIT, ...options };

  // Generate key for rate limiting (IP address or custom)
  const key = opts.keyGenerator
    ? opts.keyGenerator(request)
    : request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For")?.split(",")[0] ||
      "unknown";

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Clean up old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) {
        rateLimitStore.delete(k);
      }
    }
  }

  if (!entry || entry.resetAt < now) {
    // Create new entry
    const resetAt = now + (opts.windowMs || 60000);
    rateLimitStore.set(key, { count: 1, resetAt });
    return { limited: false, remaining: (opts.maxRequests || 60) - 1, resetAt };
  }

  // Check if limit exceeded
  if (entry.count >= (opts.maxRequests || 60)) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }

  // Increment counter
  entry.count++;
  return {
    limited: false,
    remaining: (opts.maxRequests || 60) - entry.count,
    resetAt: entry.resetAt
  };
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: Response,
  remaining: number,
  resetAt: number,
  limit: number
): Response {
  const headers = new Headers(response.headers);

  headers.set("X-RateLimit-Limit", limit.toString());
  headers.set("X-RateLimit-Remaining", remaining.toString());
  headers.set("X-RateLimit-Reset", Math.floor(resetAt / 1000).toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
