// ABOUTME: Service worker configuration for PWA functionality with Serwist
// ABOUTME: Handles caching strategies for API routes and static assets

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, CacheFirst, NetworkFirst } from "serwist";

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest. By default, this string is set to
// `"self.__SW_MANIFEST"`.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /^\/api\/(meals|recommend)/,
      handler: new CacheFirst({
        cacheName: "api-cache",
        plugins: [
          {
            cacheKeyWillBeUsed: async ({ request }) => request.url,
          },
        ],
      }),
    },
    {
      matcher: /^\/api\//,
      handler: new NetworkFirst({
        cacheName: "api-fallback",
        plugins: [
          {
            cacheKeyWillBeUsed: async ({ request }) => request.url,
          },
        ],
      }),
    },
  ],
});

serwist.addEventListeners();