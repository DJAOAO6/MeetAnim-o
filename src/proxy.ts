import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession, sessionCookieName } from "@/lib/auth/session";

const protectedPrefix = "/dashboard";
const loginPath = "/login";

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(sessionCookieName)?.value;
  const session = await decryptSession(token);

  if (pathname.startsWith(protectedPrefix) && !session) {
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === loginPath && session) {
    return NextResponse.redirect(new URL(protectedPrefix, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
