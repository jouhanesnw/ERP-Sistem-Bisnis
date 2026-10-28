'use client'

import { useEffect, useMemo, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function ActivityPageTracker({ companyId }: { companyId: string }) {
  const pathname = usePathname()
  const sb = useMemo(() => supabaseBrowser(), [])
  const lastPath = useRef('')

  useEffect(() => {
    if (!pathname || pathname.startsWith('/login')) return
    const key = companyId + ':' + pathname
    if (lastPath.current === key) return
    lastPath.current = key

    void sb.rpc('company_activity_log_ui', {
      p_company_id: companyId,
      p_action: 'VIEW',
      p_path: pathname,
    }).then(({ error }) => {
      if (error) {
        // A navigation audit must never break the page the user is opening.
        console.warn('Log aktivitas halaman tidak tersimpan:', error.message)
      }
    })
  }, [companyId, pathname, sb])

  return null
}
