import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Jalur tanpa login. Endpoint lokasi tetap memvalidasi token kendaraan di route handler.
const PUBLIK = ['/api/cron', '/api/lokasi', '/lacak/']

export async function middleware(req: NextRequest) {
  if (PUBLIK.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next()

  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value))
        res = NextResponse.next({ request: req })
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  const onLogin = req.nextUrl.pathname.startsWith('/login')
  if (!user && !onLogin) return NextResponse.redirect(new URL('/login', req.url))
  if (user && onLogin) return NextResponse.redirect(new URL('/dashboard', req.url))
  return res
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
