'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function OnboardingPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('Pengguna')
  const [step, setStep] = useState<'welcome' | 'company'>('welcome')
  const [name, setName] = useState('')
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

      // Hindari menampilkan onboarding lagi atau membuat perusahaan duplikat
      // bila akun ini sebenarnya sudah memiliki keanggotaan perusahaan.
      const { data: memberships, error: membershipError } = await sb
        .from('memberships')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)

      if (!membershipError && memberships?.length) {
        router.replace('/dashboard')
        router.refresh()
        return
      }
      if (alive) setChecking(false)
    }
    void initialize()
    return () => { alive = false }
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const companyName = name.trim()
    if (!companyName) return setError('Masukkan nama data usaha terlebih dahulu.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabaseBrowser().rpc('create_company', { p_name: companyName })
    setBusy(false)
    if (error) return setError(error.message)
    if (!data) return setError('Data usaha belum berhasil dibuat. Silakan coba lagi.')

    document.cookie = `company_id=${data}; path=/; max-age=31536000; samesite=lax`
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
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4 text-slate-900">
      <form onSubmit={submit} className="card w-full max-w-xl space-y-5 p-8 sm:p-10">
        <p className="text-sm font-medium uppercase tracking-wide text-brand">Langkah berikutnya</p>
        <h1 className="text-2xl font-semibold">Buat Data Usaha</h1>
        <p className="text-sm leading-6 text-ink/70">Masukkan nama perusahaan atau usaha yang akan menjadi induk dashboard kamu. Kamu akan menjadi pemilik dan bisa mengundang anggota serta mengatur akses divisi setelah data usaha dibuat.</p>
        <label htmlFor="company-name" className="block text-sm font-medium">Nama data usaha</label>
        <input id="company-name" className="input" placeholder="Contoh: PT Nama Perusahaan" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required autoFocus />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn w-full" disabled={busy} onClick={() => { setError(null); setStep('welcome') }}>Kembali</button>
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Membuat data usaha…' : 'Simpan dan Lanjutkan'}</button>
        </div>
      </form>
    </main>
  )
}
