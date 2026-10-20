// ABOUTME: Service worker configuration for PWA functionality with Serwist
// ABOUTME: Handles caching strategies for API routes and static assets

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";
import { defaultCache } from "@serwist/next/worker";

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

const pilotPath = /^\/(?:api\/pilot|pilot)(?:\/|$)/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST?.filter(entry => !pilotPath.test(
    new URL(typeof entry === "string" ? entry : entry.url, self.location.origin).pathname,
  )),
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Other same-origin GET /api/* routes keep defaultCache's offline NetworkFirst strategy.
  runtimeCaching: [
    { matcher: ({ sameOrigin, url }) => sameOrigin && pilotPath.test(url.pathname), handler: new NetworkOnly() },
    ...defaultCache,
  ],
});

serwist.addEventListeners();