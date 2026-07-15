import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

declare global {
  // Set by the Worker entry from the Cloudflare R2 binding so that
  // the document service can access it without needing context.cloudflare
  var __R2_BUCKET: R2Bucket | undefined;
}

interface Env {
  DOCUMENTS: R2Bucket;
  DATABASE_URL: string;
  OLLAMA_API_KEY: string;
  OLLAMA_BASE_URL: string;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Copy Cloudflare secrets/vars into process.env so that app modules
    // (db/client.ts, ai-provider.ts, session.ts, etc.) can access them
    // at module load time. The server build is loaded lazily on first
    // request via the dynamic import above, so process.env will be
    // populated before those modules run.
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
    if (env.OLLAMA_API_KEY) process.env.OLLAMA_API_KEY = env.OLLAMA_API_KEY;
    if (env.OLLAMA_BASE_URL) process.env.OLLAMA_BASE_URL = env.OLLAMA_BASE_URL;
    if (env.APP_PASSWORD) process.env.APP_PASSWORD = env.APP_PASSWORD;
    if (env.SESSION_SECRET) process.env.SESSION_SECRET = env.SESSION_SECRET;

    // Store R2 bucket globally so document service can access it
    if (env.DOCUMENTS) globalThis.__R2_BUCKET = env.DOCUMENTS;

    // In v8 with middleware, context must be a RouterContextProvider.
    // Passing undefined makes React Router create an empty one.
    // R2 bucket is passed via globalThis instead of context.
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;