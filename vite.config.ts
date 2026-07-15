import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// When CLOUDFLARE=1 is set, use the Cloudflare Vite plugin to run server code
// in the Workers runtime (workerd) and produce a Workers-compatible build.
// Without it, local dev uses Node.js with filesystem access for documents.
const useCloudflare = !!process.env.CLOUDFLARE;

export default defineConfig(({ mode }) => {
  // Load ALL env vars (not just VITE_ prefixed) from .env files
  // and inject them into process.env for server-side access
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  return {
    plugins: [
      // Cloudflare plugin must be first when active
      ...(useCloudflare
        ? [cloudflare({ viteEnvironment: { name: "ssr" } })]
        : []),
      reactRouter(),
      tsconfigPaths(),
    ],
  };
});