import { redirect, type MiddlewareFunction } from "react-router";
import { isAuthenticated } from "~/auth/session";

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