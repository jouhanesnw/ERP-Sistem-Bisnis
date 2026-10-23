import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import { buildPerms, type Role } from './permissions'

// Dipanggil di layout dan halaman server. Hasilnya di-cache per request.
export const getAppContext = cache(async () => {
  const supabase = supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error: membershipsError } = await supabase
    .from('memberships')
    .select('id, role, company_id, companies(id, name)')
    .eq('user_id', user.id)
  if (membershipsError) redirect('/data-usaha?error=membership-read')
  const memberships = (data ?? []) as any[]
  if (!memberships.length) redirect('/onboarding')

  const wanted = cookies().get('company_id')?.value
  const active = memberships.find((m) => m.company_id === wanted) ?? memberships[0]

  // Load account profile and active-company permissions concurrently.
  // Both depend on the resolved user/company but not on each other.
  const [profileResult, accessResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('module_access')
      .select('module, can_view, can_create, can_edit, can_delete')
      .eq('membership_id', active.id),
  ])
  const fullName = profileResult.data?.full_name?.trim()
    || user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || 'Pengguna'
  const access = accessResult.data

  return {
    user: { id: user.id, email: user.email ?? '', fullName },
    companies: memberships.map((m) => ({ id: m.company_id as string, name: m.companies.name as string, role: m.role as Role })),
    active: { companyId: active.company_id as string, membershipId: active.id as string, role: active.role as Role, name: active.companies.name as string },
    perms: buildPerms(active.role, access ?? []),
  }
})
