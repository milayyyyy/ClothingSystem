/** @type {import('next').NextConfig} */
const path = require("path");
try {
  const { loadEnvConfig } = require("@next/env");
  // Load .env* from this directory (web/) even if the process cwd differs.
  loadEnvConfig(path.join(__dirname));
} catch {
  /* @next/env ships with Next */
}

const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;
