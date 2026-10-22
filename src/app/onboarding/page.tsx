'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ImagePlus, Upload, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

const JENIS_USAHA = [
  'Perorangan',
  'PT Perorangan',
  'Perseroan Terbatas (PT)',
  'Commanditaire Vennootschap (CV)',
  'Firma',
  'Koperasi',
  'Yayasan',
  'BUMDes',
  'Usaha lainnya',
]

const BIDANG_USAHA = [
  'Perdagangan / Retail',
  'Grosir / Distributor',
  'Manufaktur / Produksi',
  'Bahan bangunan dan material',
  'Kerajinan dan perlengkapan seni',
  'Makanan dan minuman',
  'Jasa profesional',
  'Teknologi dan digital',
  'Transportasi dan logistik',
  'Konstruksi',
  'Pendidikan',
  'Kesehatan',
  'Lainnya',
]

const MAX_LOGO_BYTES = 512 * 1024

export default function OnboardingPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('Pengguna')
  const [step, setStep] = useState<'welcome' | 'company'>('welcome')
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [businessField, setBusinessField] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let alive = true
    async function initialize() {
      const sb = supabaseBrowser()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const displayName = user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0]
        || 'Pengguna'
      if (alive) setFullName(displayName)

      const addAnotherBusiness = new URLSearchParams(window.location.search).get('new') === '1'
      const { data: memberships, error: membershipError } = await sb
        .from('memberships')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)

      if (!membershipError && memberships?.length && !addAnotherBusiness) {
        router.replace('/dashboard')
        router.refresh()
        return
      }
      if (alive) {
        if (addAnotherBusiness) setStep('company')
        setChecking(false)
      }
    }
    void initialize()
    return () => { alive = false }
  }, [router])

  useEffect(() => {
    if (!logo) {
      setLogoPreview(null)
      return
    }
    const preview = URL.createObjectURL(logo)
    setLogoPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [logo])

  function chooseLogo(file?: File) {
    setError(null)
    if (!file) {
      setLogo(null)
      return
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Logo harus berupa file PNG, JPG, atau JPEG.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Ukuran logo maksimal 512 KB.')
      return
    }
    setLogo(file)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const companyName = name.trim()
    const companyAlias = alias.trim()
    if (!companyName || !companyAlias || !businessType || !businessField) {
      setError('Lengkapi semua kolom wajib sebelum membuat data usaha.')
      return
    }
    if (logo && (!['image/png', 'image/jpeg'].includes(logo.type) || logo.size > MAX_LOGO_BYTES)) {
      setError('Logo harus PNG/JPG/JPEG dan berukuran maksimal 512 KB.')
      return
    }

    setBusy(true)
    setError(null)
    const sb = supabaseBrowser()
    const { data: companyId, error: createError } = await sb.rpc('create_company_with_details', {
      p_name: companyName,
      p_alias: companyAlias,
      p_business_type: businessType,
      p_business_field: businessField,
    })

    if (createError) {
      setBusy(false)
      if (createError.message.includes('create_company_with_details')) {
        setError('Fitur detail usaha belum aktif di database. Jalankan migrasi 010_company_onboarding.sql di Supabase SQL Editor, lalu coba lagi.')
      } else {
        setError(createError.message)
      }
      return
    }
    if (!companyId) {
      setBusy(false)
      setError('Data usaha belum berhasil dibuat. Silakan coba lagi.')
      return
    }

    let logoWarning = ''
    if (logo) {
      const extension = logo.type === 'image/png' ? 'png' : 'jpg'
      const path = `${companyId}/logo-${Date.now()}.${extension}`
      const { error: uploadError } = await sb.storage
        .from('company-logos')
        .upload(path, logo, { contentType: logo.type, upsert: false })

      if (uploadError) {
        logoWarning = 'Data usaha berhasil dibuat, tetapi logo belum berhasil diunggah.'
      } else {
        const { data: publicUrl } = sb.storage.from('company-logos').getPublicUrl(path)
        const { error: saveLogoError } = await sb
          .from('companies')
          .update({ logo_url: publicUrl.publicUrl })
          .eq('id', companyId)
        if (saveLogoError) logoWarning = 'Data usaha berhasil dibuat, tetapi alamat logo belum tersimpan.'
      }
    }

    document.cookie = `company_id=${companyId}; path=/; max-age=31536000; samesite=lax`
    if (logoWarning) sessionStorage.setItem('onboarding_logo_notice', logoWarning)
    router.replace('/dashboard')
    router.refresh()
  }

  if (checking) {
    return <main className="grid min-h-screen place-items-center p-4"><div className="card w-full max-w-lg p-6 text-center">Memeriksa akun dan data usaha…</div></main>
  }

  if (step === 'welcome') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-4 text-slate-900">
        <section role="dialog" aria-labelledby="welcome-title" aria-modal="true" className="card w-full max-w-xl space-y-5 p-8 text-center sm:p-10">
          <p className="text-sm font-medium uppercase tracking-wide text-brand">ERP Sistem Bisnis</p>
          <h1 id="welcome-title" className="text-2xl font-semibold">Selamat Datang</h1>
          <h2 className="text-3xl font-bold">{fullName}</h2>
          <p className="text-base leading-7 text-ink/70">Anda sudah berhasil masuk ke ERP. Untuk mulai menggunakan aplikasi, buat data usaha terlebih dahulu dengan menekan tombol di bawah ini.</p>
          <button type="button" className="btn btn-primary w-full" onClick={() => setStep('company')}>Buat Data Usaha</button>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-8 text-slate-900 sm:px-6">
      <form onSubmit={submit} className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 pb-8 pt-7 sm:px-10 sm:pt-9">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Lengkapi detail usaha Anda</h1>
            <p className="mt-2 text-sm text-slate-400 sm:text-base">Informasi ini digunakan untuk menyiapkan konfigurasi awal sistem</p>
          </div>

          <div className="grid gap-x-8 gap-y-5 md:grid-cols-[240px_minmax(0,1fr)] md:items-center">
            <div className="text-base font-semibold text-slate-600 md:self-start md:pt-2">Logo Usaha</div>
            <div className="flex flex-wrap items-center gap-5 sm:gap-8">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                {logoPreview
                  ? <img src={logoPreview} alt="Pratinjau logo usaha" className="h-full w-full object-cover" />
                  : <ImagePlus size={48} strokeWidth={1.5} className="text-slate-300" />}
              </div>
              <div className="space-y-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-rose-500 px-5 py-2.5 font-medium text-white shadow-sm hover:bg-rose-600">
                  <Upload size={17} />
                  {logo ? 'Ganti Logo' : 'Upload'}
                  <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => chooseLogo(e.target.files?.[0])} />
                </label>
                {logo && <button type="button" className="ml-2 text-sm text-red-600 hover:underline" onClick={() => setLogo(null)}><X size={14} className="mr-1 inline" />Hapus</button>}
                <p className="text-sm leading-6 text-slate-500">Ukuran maks: 512 KB<br />Tipe file: png, jpg, jpeg</p>
              </div>
            </div>

            <label htmlFor="company-name" className="text-base font-semibold text-slate-600">Nama Perusahaan <span className="text-red-500">*</span></label>
            <input id="company-name" className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100" placeholder="Ex: PT Cipta Piranti Sejahtera" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required autoComplete="organization" />

            <label htmlFor="company-alias" className="text-base font-semibold text-slate-600">Nama Alias <span className="text-red-500">*</span></label>
            <input id="company-alias" className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100" placeholder="Ex: Accurate" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={80} required />

            <label htmlFor="business-type" className="text-base font-semibold text-slate-600">Jenis Usaha <span className="text-red-500">*</span></label>
            <select id="business-type" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={businessType} onChange={(e) => setBusinessType(e.target.value)} required>
              <option value="">Pilih Kategori Data Usaha...</option>
              {JENIS_USAHA.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>

            <label htmlFor="business-field" className="text-base font-semibold text-slate-600">Bidang Usaha <span className="text-red-500">*</span></label>
            <select id="business-field" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100" value={businessField} onChange={(e) => setBusinessField(e.target.value)} required>
              <option value="">Pilih Bidang Usaha...</option>
              {BIDANG_USAHA.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>

          {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="mt-8 flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-5 sm:flex-row">
            <button type="button" className="btn" disabled={busy} onClick={() => { setError(null); setStep('welcome') }}>Kembali</button>
            <button type="submit" className="btn btn-primary min-w-48" disabled={busy || !name.trim() || !alias.trim() || !businessType || !businessField}>
              {busy ? 'Membuat data usaha…' : <><Building2 size={17} />Buat Data Usaha</>}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Logo opsional. Semua kolom bertanda * wajib diisi.</p>
        </div>
      </form>
    </main>
  )
}
