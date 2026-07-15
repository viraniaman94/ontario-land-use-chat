import { createCookieSessionStorage, redirect } from "react-router";

/**
 * Simple single-password auth (no user accounts).
 *
 * The password is hardcoded via the APP_PASSWORD env var (defaults to
 * "ontario2025"). A signed cookie session stores an `authenticated: true`
 * flag. All protected loaders/actions call `requireAuth()` which redirects
 * unauthenticated browser requests to /login and throws 401 for API/fetch
 * requests.
 */

const sessionSecret =
  process.env.SESSION_SECRET ||
  "dev-only-secret-change-in-production-please-be-32-chars";

if (sessionSecret.length < 32 && process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️  SESSION_SECRET should be at least 32 characters in production.",
  );
}

export const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: {
      name: "ontario_land_use_session",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      secrets: [sessionSecret],
    },
  });

/** The single shared password. Override via APP_PASSWORD env var. */
export const APP_PASSWORD = process.env.APP_PASSWORD || "ontario2025";

/**
 * Check whether the password matches the hardcoded app password.
 */
export function checkPassword(password: string): boolean {
  return password === APP_PASSWORD;
}

/**
 * Extract the authenticated flag from the request's cookie session.
 */
export async function isAuthenticated(request: Request): Promise<boolean> {
  const session = await getSession(request.headers.get("Cookie"));
  return session.get("authenticated") === true;
}

/**
 * Guard for browser routes: redirect to /login if not authenticated.
 */
export async function requireAuth(request: Request): Promise<void> {
  const authed = await isAuthenticated(request);
  if (!authed) {
    throw redirect("/login");
  }
}

/**
 * Guard for API/resource routes: return a 401 JSON response instead of
 * redirecting (fetch requests shouldn't get HTML redirects).
 */
export async function requireApiAuth(
  request: Request,
): Promise<Response | null> {
  const authed = await isAuthenticated(request);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * Create a response that sets the authenticated session cookie.
 */
export async function createAuthResponse(
  redirectTo: string = "/",
): Promise<Response> {
  const session = await getSession();
  session.set("authenticated", true);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

/**
 * Create a response that destroys the session cookie (logout).
 */
export async function destroyAuthResponse(
  redirectTo: string = "/login",
): Promise<Response> {
  const session = await getSession();
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await destroySession(session) },
  });
}