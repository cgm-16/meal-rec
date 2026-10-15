// ABOUTME: Server layout that hides the Sentry example page in production
// ABOUTME: The page deliberately raises errors, so it is only served in preview and development

import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export default function SentryExampleLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL_ENV === 'production') {
    notFound();
  }
  return children;
}
