import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No server-external packages needed — documents are read as .md files
  // directly from the filesystem. pdf-parse is no longer used.
};

export default nextConfig;
