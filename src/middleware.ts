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

  // Verify/refresh the session once in middleware. Forward only this verified identity
  // to the server-rendered layout to avoid repeating the same Auth network request.
  const { data: { user } } = await supabase.auth.getUser()
  const onLogin = req.nextUrl.pathname.startsWith('/login')

  if (!user && !onLogin) {
    return attachRefreshedCookies(NextResponse.redirect(new URL('/login', req.url)), refreshedCookies)
  }
  if (user && onLogin) {
    return attachRefreshedCookies(NextResponse.redirect(new URL('/dashboard', req.url)), refreshedCookies)
  }

  const requestHeaders = new Headers(req.headers)
  // Remove any client-supplied identity headers before adding verified values.
  IDENTITY_HEADERS.forEach((name) => requestHeaders.delete(name))
  if (user) {
    requestHeaders.set('x-erp-auth-user-id', user.id)
    requestHeaders.set('x-erp-auth-user-email', user.email ?? '')
    requestHeaders.set('x-erp-auth-user-name', String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''))
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  return attachRefreshedCookies(response, refreshedCookies)
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
