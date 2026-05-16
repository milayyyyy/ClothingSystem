/** @type {import('next').NextConfig} */
const path = require("path");
try {
  const { loadEnvConfig } = require("@next/env");
  // Load .env* from this directory (web/) even if the process cwd differs.
  loadEnvConfig(path.join(__dirname));
} catch {
  /* @next/env ships with Next */
}

const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // face-api.js relies on browser-only APIs (canvas, WebGL).
      // Exclude it from the server bundle so the dynamic import resolves correctly.
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, "face-api.js"]
        : config.externals
        ? [config.externals, "face-api.js"]
        : ["face-api.js"];
    }
    return config;
  },
};
module.exports = nextConfig;
