import { type EntryContext, type RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

/**
 * Custom SSR entry server. Uses renderToReadableStream (Web Streams),
 * which is supported in Node.js 18+ as well as edge runtimes.
 * Includes error details in the response for debugging.
 */

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
) {
  let shellRendered = false;
  let caughtError: unknown = null;
  const userAgent = request.headers.get("user-agent");

  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      onError(error: unknown) {
        responseStatusCode = 500;
        caughtError = error;
        console.error("SSR Error:", error);
      },
    },
  );
  shellRendered = true;

  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady;
  }

  if (caughtError) {
    const errHtml = `<html><body><h1>SSR Error</h1><pre>${caughtError instanceof Error ? caughtError.stack : String(caughtError)}</pre></body></html>`;
    return new Response(errHtml, {
      headers: { "Content-Type": "text/html" },
      status: 500,
    });
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}