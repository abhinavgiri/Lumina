import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the PDF parser (and its pdfjs dependency) out of the server bundle so
  // it's required from node_modules at runtime — otherwise pdfjs can't find its
  // worker file (pdf.worker.mjs) and every PDF upload throws.
  // pdfkit reads its built-in AFM font-metric files from node_modules at
  // runtime, so it must stay external (bundling it breaks font loading).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "pdfkit"],
};

export default nextConfig;
