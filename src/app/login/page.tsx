'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'masuk' | 'daftar'>('masuk')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const sb = supabaseBrowser()

    if (mode === 'masuk') {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) return setError(error.message)
      router.push('/dashboard')
      router.refresh()
      return
    }

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setBusy(false)
    if (error) return setError(error.message)

    if (data.session) {
      router.push('/dashboard')
      router.refresh()
      return
    }

    setNotice('Akun berhasil dibuat. Buka email kamu dan klik tautan konfirmasi. Setelah itu kamu akan diarahkan kembali ke ERP untuk masuk.')
  }

  async function resendConfirmation() {
    setBusy(true)
    setError(null)
    const { error } = await supabaseBrowser().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setBusy(false)
    if (error) return setError(error.message)
    setNotice('Email konfirmasi dikirim ulang. Buka email terbaru dan gunakan tautannya.')
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-semibold">{mode === 'masuk' ? 'Masuk ke ERP' : 'Buat akun'}</h1>
        {mode === 'daftar' && <input className="input" placeholder="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} required />}
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Kata sandi (min. 6 karakter)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        {mode === 'daftar' && <button type="button" className="w-full text-sm text-brand hover:underline" onClick={resendConfirmation} disabled={busy}>{busy ? 'Mengirim…' : 'Kirim ulang email konfirmasi'}</button>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : 'Daftar'}</button>
        <button type="button" className="w-full text-sm text-brand hover:underline" onClick={() => setMode(mode === 'masuk' ? 'daftar' : 'masuk')}>
          {mode === 'masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
        </button>
      </form>
    </main>
  )
}
