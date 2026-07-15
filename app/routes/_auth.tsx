import { Outlet, type LoaderFunctionArgs } from "react-router";
import { authMiddleware } from "~/auth/middleware";
import { ensureSchema } from "~/db/client";

/**
 * Pathless layout route that guards all authenticated pages via v8 middleware.
 * The middleware redirects unauthenticated browser requests to /login.
 * The loader ensures the database schema exists (idempotent).
 */

export const middleware = [authMiddleware];

export async function loader(_args: LoaderFunctionArgs) {
  // Ensure DB tables exist (idempotent — runs once per server lifetime)
  await ensureSchema();
  return { ok: true };
}

export default function AuthLayout() {
  return <Outlet />;
}