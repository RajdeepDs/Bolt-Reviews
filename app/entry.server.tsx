import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

/**
 * Production-ready error logger
 * In production, consider integrating with a service like Sentry, LogRocket, etc.
 */
function logError(error: unknown, context: string) {
  const isProduction = process.env.NODE_ENV === "production";
  const timestamp = new Date().toISOString();

  if (error instanceof Error) {
    const errorInfo = {
      timestamp,
      context,
      message: error.message,
      stack: isProduction ? undefined : error.stack, // Don't log stack in prod logs
      name: error.name,
    };

    if (isProduction) {
      // In production, use structured logging
      console.error(JSON.stringify(errorInfo));

      // TODO: Send to error tracking service (Sentry, etc.)
      // Sentry.captureException(error, { tags: { context } });
    } else {
      console.error(`[${context}]`, error);
    }
  } else {
    console.error(`[${context}] Unknown error:`, error);
  }
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          logError(error, "ShellError");
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          logError(error, "RenderError");
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
