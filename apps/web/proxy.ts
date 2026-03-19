import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const authRoutes = ['/login', '/register'];

export default async function middleware(req: NextRequest) {
  // TODO: Remove this bypass once API auth is deployed
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    return NextResponse.next();
  }

  const { nextUrl } = req;
  const { pathname, origin, search } = nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const callbackUrl = `${pathname}${search}`;
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('callbackUrl', callbackUrl);

  if (!token) {
    if (authRoutes.includes(pathname)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(loginUrl);
  }

  if (authRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL('/', origin));
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|images|favicon.ico|.*\\.png|.*\\.svg|$).*)'] };
