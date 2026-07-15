import type { ActionFunctionArgs } from "react-router";
import { destroyAuthResponse } from "~/auth/session";

/**
 * Logout resource route. POST here to destroy the session and
 * redirect to /login.
 */
export async function action({ request }: ActionFunctionArgs) {
  return destroyAuthResponse("/login");
}

// Also support GET for simple link-based logout
export async function loader({ request }: ActionFunctionArgs) {
  return destroyAuthResponse("/login");
}