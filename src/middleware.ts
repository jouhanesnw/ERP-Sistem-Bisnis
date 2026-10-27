import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Jalur tanpa login. Endpoint lokasi tetap memvalidasi token kendaraan di route handler.
const PUBLIK = ['/api/cron', '/api/lokasi', '/lacak/', '/auth/callback']
const IDENTITY_HEADERS = ['x-erp-auth-user-id', 'x-erp-auth-user-email', 'x-erp-auth-user-name']

function attachRefreshedCookies<T extends NextResponse>(response: T, cookies: Parameters<SetAllCookies>[0]) {
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
  return response
}

export async function middleware(req: NextRequest) {
  if (PUBLIK.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next()

  let refreshedCookies: Parameters<SetAllCookies>[0] = []
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: Parameters<SetAllCookies>[0]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value))
        refreshedCookies = list
      },
    },
  })

  // Verify the access token via its signed claims. With asymmetric Supabase signing
  // keys this can be checked locally (using cached JWKS), avoiding an Auth network
  // request on every page navigation/prefetch. getClaims also refreshes near-expiry
  // sessions and falls back to Auth verification when local verification is unavailable.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims as Record<string, unknown> | null | undefined
  const userId = typeof claims?.sub === 'string' ? claims.sub : null
  const userEmail = typeof claims?.email === 'string' ? claims.email : ''
  const metadata = claims?.user_metadata && typeof claims.user_metadata === 'object'
    ? claims.user_metadata as Record<string, unknown>
    : {}
  const metadataName = String(metadata.full_name ?? metadata.name ?? '')
  const onLogin = req.nextUrl.pathname.startsWith('/login')

  if (!userId && !onLogin) {
    return attachRefreshedCookies(NextResponse.redirect(new URL('/login', req.url)), refreshedCookies)
  }
  if (userId && onLogin) {
    return attachRefreshedCookies(NextResponse.redirect(new URL('/dashboard', req.url)), refreshedCookies)
  }

  const requestHeaders = new Headers(req.headers)
  // Remove any client-supplied identity headers before adding verified values.
  IDENTITY_HEADERS.forEach((name) => requestHeaders.delete(name))
  if (userId) {
    requestHeaders.set('x-erp-auth-user-id', userId)
    requestHeaders.set('x-erp-auth-user-email', userEmail)
    requestHeaders.set('x-erp-auth-user-name', metadataName)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  return attachRefreshedCookies(response, refreshedCookies)
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|css|js|map)$).*)'] }
