import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Client-side auth check happens in the providers/layout.
// This middleware is a lightweight guard for the initial page load.
// Since we store tokens in localStorage (not cookies), we can't read them
// in middleware — the actual auth gate is in the client-side layout.
export function middleware(request: NextRequest) {
  // Let login page through always
  if (request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // Let API routes and static files through
  if (
    request.nextUrl.pathname.startsWith("/api") ||
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
