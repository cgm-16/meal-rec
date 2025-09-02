import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
};

const configWithPWA = withSerwist(nextConfig);

// Only enable Sentry if auth token is provided and not explicitly disabled
const shouldUseSentry = process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_AUTH_TOKEN !== 'disabled';

export default shouldUseSentry 
  ? withSentryConfig(configWithPWA, {
      org: "mealrec",
      project: "meal-recommendation-pwa",
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      disableLogger: true,
      automaticVercelMonitors: true,
    })
  : configWithPWA;
