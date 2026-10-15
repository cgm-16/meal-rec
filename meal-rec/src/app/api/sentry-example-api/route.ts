// ABOUTME: Deliberately failing API route for verifying Sentry server-side error reporting
// ABOUTME: Returns 404 in production so it cannot be used to flood Sentry

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}
// A faulty API route to test Sentry's error monitoring
export function GET() {
  // Deliberately throws; hidden in production so it cannot be used to flood Sentry
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  throw new SentryExampleAPIError("This error is raised on the backend called by the example page.");
  return NextResponse.json({ data: "Testing Sentry Error..." });
}
