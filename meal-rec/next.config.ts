import type { NextConfig } from "next";

// @ts-ignore - next-pwa doesn't have proper TypeScript declarations
const withPWA = require("next-pwa");

const nextConfig: NextConfig = {
  /* config options here */
};

export default withPWA({
  dest: "public",
  runtimeCaching: [
    {
      urlPattern: /^\/api\/(meals|recommend)/,
      handler: "CacheFirst",
      options: {
        cacheName: "api-cache",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 60 * 60 * 24 // 24 hours
        }
      }
    }
  ]
})(nextConfig);
