'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { data, error } = await supabaseBrowser().rpc('create_company', { p_name: name })
    setBusy(false)
    if (error) return setError(error.message)
    document.cookie = `company_id=${data}; path=/; max-age=31536000`
    router.push('/dashboard'); router.refresh()
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-semibold">Buat perusahaan</h1>
        <p className="text-sm text-ink/60">Anda akan menjadi pemilik. Anggota lain bisa ditambahkan nanti di Pengaturan.</p>
        <input className="input" placeholder="Nama perusahaan" value={name} onChange={(e) => setName(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Membuat…' : 'Buat perusahaan'}</button>
      </form>
    </main>
  )
}
