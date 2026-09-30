import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
  allowedDevOrigins: [
    "*.agent.cvm.dev",
    "*.cursorvm.com",
    "localhost",
    "127.0.0.1",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.agent.cvm.dev", "*.cursorvm.com", "localhost", "127.0.0.1"],
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
