import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function supabaseServer() {
  const store = cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: Parameters<SetAllCookies>[0]) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch {}
      },
    },
  })
}
