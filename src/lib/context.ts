import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import { buildPerms, type Role } from './permissions'

// Dipanggil di layout dan halaman server. Hasilnya di-cache per request.
export const getAppContext = cache(async () => {
  const supabase = supabaseServer()
  const requestHeaders = headers()

  // Middleware has already verified this identity with Supabase Auth and strips
  // client-provided copies of these headers. Fall back to Auth for nonstandard paths.
  let userId = requestHeaders.get('x-erp-auth-user-id')
  let userEmail = requestHeaders.get('x-erp-auth-user-email') ?? ''
  let metadataName = requestHeaders.get('x-erp-auth-user-name') ?? ''

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    userId = user.id
    userEmail = user.email ?? ''
    metadataName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '')
  }

  const { data, error: membershipsError } = await supabase
    .from('memberships')
    .select('id, role, company_id, profiles(full_name), companies(id, name)')
    .eq('user_id', userId)
  if (membershipsError) redirect('/data-usaha?error=membership-read')
  const memberships = (data ?? []) as any[]
  if (!memberships.length) redirect('/onboarding')

  const wanted = cookies().get('company_id')?.value
  const active = memberships.find((m) => m.company_id === wanted) ?? memberships[0]

  // Embedded profile avoids a separate request. Members need module permission rows;
  // owners/admins already have full module access and do not need that extra query.
  const access = active.role === 'member'
    ? ((await supabase
        .from('module_access')
        .select('module, can_view, can_create, can_edit, can_delete')
        .eq('membership_id', active.id)).data ?? [])
    : []
  const profile = Array.isArray(active.profiles) ? active.profiles[0] : active.profiles
  const fullName = profile?.full_name?.trim()
    || metadataName
    || userEmail.split('@')[0]
    || 'Pengguna'

  return {
    user: { id: userId, email: userEmail, fullName },
    companies: memberships.map((m) => ({ id: m.company_id as string, name: m.companies.name as string, role: m.role as Role })),
    active: { companyId: active.company_id as string, membershipId: active.id as string, role: active.role as Role, name: active.companies.name as string },
    perms: buildPerms(active.role, access),
  }
})
