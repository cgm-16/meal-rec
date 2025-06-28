// ABOUTME: Next.js instrumentation file for Sentry initialization
// ABOUTME: Required for proper Sentry SDK setup in server environment

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}