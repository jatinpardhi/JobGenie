import { NextResponse } from "next/server";

/**
 * Map known errors to clean HTTP responses. Use inside route try/catch
 * so unauthenticated, malformed-JSON, and validation failures don't
 * surface as 500s.
 */
export function apiError(e: unknown): NextResponse {
  if (e instanceof Error && e.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (e instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Log unexpected errors for debugging but don't leak details.
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
