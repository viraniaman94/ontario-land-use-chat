import { redirect, type MiddlewareFunction } from "react-router";
import { isAuthenticated } from "~/auth/session";
import { setDocumentStorage } from "~/lib/agent/document-service";

/**
 * R2 storage middleware — wires the Cloudflare R2 DOCUMENTS binding into
 * the document service. Runs as a "before only" middleware (no next() call).
 * The R2 bucket is set on globalThis by the Worker entry (workers/app.ts).
 * On Node.js (local dev without Cloudflare), the global is absent and the
 * document service falls back to filesystem reads.
 */
export const r2StorageMiddleware: MiddlewareFunction = async () => {
  // R2 bucket is set on globalThis by the Worker entry — not via context
  // (v8 middleware requires RouterContextProvider, not plain objects)
  // R2Bucket is a Cloudflare Workers type not available in the app/
  // tsconfig scope (which doesn't include @cloudflare/workers-types).
  // setDocumentStorage() accepts `unknown` and casts internally, so
  // typing the global as `unknown` is sufficient here.
  const r2 = (globalThis as { __R2_BUCKET?: unknown }).__R2_BUCKET;
  if (r2) {
    setDocumentStorage(r2);
  }
};

/**
 * Browser auth middleware — redirects to /login if not authenticated.
 * Used by the _auth.tsx pathless layout route to guard all child pages.
 */
export const authMiddleware: MiddlewareFunction = async ({ request }) => {
  const authed = await isAuthenticated(request);
  if (!authed) {
    throw redirect("/login");
  }
};

/**
 * API auth middleware — throws a 401 JSON Response if not authenticated.
 * Used by resource routes (api.chat, api.conversations, etc.) to guard
 * loader/action endpoints without redirecting.
 */
export const apiAuthMiddleware: MiddlewareFunction = async ({ request }) => {
  const authed = await isAuthenticated(request);
  if (!authed) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
};