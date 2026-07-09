import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse -> pdfjs-dist dynamically imports `./pdf.worker.mjs` relative to
  // its own module location at runtime (Node.js "fake worker" path). If these
  // are bundled into .next/server/chunks, the relative import resolves against
  // the chunk path and fails with "Cannot find module .../pdf.worker.mjs".
  // Keeping them external preserves the correct resolution from node_modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
