import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import type { Dokumen, Jenis, Pelanggan, PjPerm, RekeningPilihan } from './types'

export async function getPjContext(): Promise<{ companyId: string; perm: PjPerm } | null> {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'penjualan')) return null
  return {
    companyId: ctx.active.companyId,
    perm: { create: can(ctx.perms, 'penjualan', 'create'), edit: can(ctx.perms, 'penjualan', 'edit'), delete: can(ctx.perms, 'penjualan', 'delete') },
  }
}

export async function loadPelanggan(companyId: string) {
  const sb = supabaseServer()
  const { data } = await sb.from('pj_pelanggan').select('*').eq('company_id', companyId).order('nama')
  return (data ?? []) as Pelanggan[]
}

export async function loadPjDocuments(companyId: string, jenis: Jenis) {
  const sb = supabaseServer()
  const { data, error } = await sb.from('pj_dokumen_v').select('*')
    .eq('company_id', companyId).eq('jenis', jenis)
    .order('tanggal', { ascending: false }).order('nomor', { ascending: false }).limit(500)
  return { rows: (data ?? []) as Dokumen[], error: error?.message ?? null }
}

export async function loadPjBase(companyId: string) {
  const sb = supabaseServer()
  const [p, r] = await Promise.all([
    sb.from('pj_pelanggan').select('*').eq('company_id', companyId).order('nama'),
    sb.rpc('pj_rekening_pilihan', { cid: companyId }),
  ])
  return { pelanggan: (p.data ?? []) as Pelanggan[], rekening: (r.data ?? []) as RekeningPilihan[] }
}
