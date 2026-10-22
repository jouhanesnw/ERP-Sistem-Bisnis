'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Plus, RefreshCw, ArrowRight, ShieldCheck } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

type Business = {
  id: string
  name: string
  alias_name: string | null
  business_type: string | null
  business_field: string | null
  logo_url: string | null
}
type MembershipRow = {
  company_id: string
  role: string
  companies: Business | Business[] | null
}

export default function BusinessCards() {
  const router = useRouter()
  const [businesses, setBusinesses] = useState<Array<{ business: Business; role: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  const loadBusinesses = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sb = supabaseBrowser()
    const { data: { user }, error: authError } = await sb.auth.getUser()
    if (authError || !user) {
      setLoading(false)
      setError('Sesi login tidak ditemukan. Silakan masuk kembali.')
      return
    }

    const { data, error: queryError } = await sb
      .from('memberships')
      .select('company_id, role, companies(id, name, alias_name, business_type, business_field, logo_url)')
      .eq('user_id', user.id)

    if (queryError) {
      setLoading(false)
      setError('Data usaha belum dapat dibaca dari database: ' + queryError.message)
      return
    }

    const rows = (data ?? []) as unknown as MembershipRow[]
    const result = rows.flatMap((row) => {
      const related = Array.isArray(row.companies) ? row.companies[0] : row.companies
      return related ? [{ business: related, role: row.role }] : []
    })
    setBusinesses(result)
    setLoading(false)
  }, [])

  useEffect(() => {
    setCreated(new URLSearchParams(window.location.search).get('created') === '1')
    void loadBusinesses()
  }, [loadBusinesses])

  function openBusiness(id: string) {
    document.cookie = `company_id=${id}; path=/; max-age=31536000; samesite=lax`
    router.push('/dashboard')
    router.refresh()
  }

  function addBusiness() {
    router.push('/onboarding?new=1')
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Data Usaha Saya</h2>
          <p className="mt-1 text-sm text-ink/60">Setiap data usaha memiliki dashboard, anggota, dan data bisnis yang terpisah.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={addBusiness}><Plus size={17} />Tambah Data Usaha</button>
      </div>

      {created && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <span>Data usaha berhasil dikirim untuk disimpan. Pilih kartu di bawah ini untuk membuka dashboard. Jika kartu belum muncul, tekan Muat Ulang untuk memeriksa data yang tersimpan.</span>
        </div>
      )}

      {loading && <div className="card p-6 text-sm text-ink/60">Memuat daftar data usaha…</div>}

      {!loading && error && (
        <div className="card space-y-3 p-5">
          <p role="alert" className="text-sm text-red-600">{error}</p>
          <p className="text-sm text-ink/60">Jangan buat data usaha yang sama berulang kali. Periksa migrasi database dan akses anggota terlebih dahulu.</p>
          <button type="button" className="btn w-fit" onClick={() => void loadBusinesses()}><RefreshCw size={16} />Muat Ulang</button>
        </div>
      )}

      {!loading && !error && businesses.length === 0 && (
        <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Building2 size={27} /></span>
          <h3 className="font-semibold">Belum ada data usaha yang terbaca</h3>
          <p className="max-w-md text-sm text-ink/60">Kalau kamu baru selesai membuat data usaha, tekan Muat Ulang. Jika tetap kosong, jangan membuat duplikat—perlu diperiksa apakah keanggotaan tersimpan.</p>
          <button type="button" className="btn" onClick={() => void loadBusinesses()}><RefreshCw size={16} />Muat Ulang</button>
          <button type="button" className="btn btn-primary" onClick={addBusiness}><Plus size={16} />Buat Data Usaha</button>
        </div>
      )}

      {!loading && !error && businesses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {businesses.map(({ business, role }) => (
            <button key={business.id} type="button" onClick={() => openBusiness(business.id)}
              className="card group flex min-h-52 flex-col text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md">
              <div className="flex items-start gap-3 p-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-canvas">
                  {business.logo_url
                    ? <img src={business.logo_url} alt={`Logo ${business.name}`} className="h-full w-full object-contain" />
                    : <Building2 size={26} className="text-ink/40" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold text-ink">{business.name}</h3>
                  {business.alias_name && <p className="mt-0.5 truncate text-sm text-ink/60">{business.alias_name}</p>}
                  <span className="mt-2 inline-flex rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{role === 'owner' ? 'Pemilik' : role === 'admin' ? 'Admin' : 'Anggota'}</span>
                </div>
                <ArrowRight size={17} className="mt-1 text-ink/40 transition group-hover:translate-x-1 group-hover:text-brand" />
              </div>
              <div className="mt-auto border-t border-line px-4 py-3">
                <p className="text-xs text-ink/60">{business.business_type || 'Jenis usaha belum diisi'}</p>
                <p className="mt-1 text-sm text-ink/80">{business.business_field || 'Bidang usaha belum diisi'}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
