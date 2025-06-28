import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// @ts-ignore - next-pwa doesn't have proper TypeScript declarations
const withPWA = require("next-pwa");

const nextConfig: NextConfig = {
  /* config options here */
};

const configWithPWA = withPWA({
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

export default withSentryConfig(configWithPWA, {
  org: "mealrec",
  project: "meal-recommendation-pwa",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
  automaticVercelMonitors: true,
});
