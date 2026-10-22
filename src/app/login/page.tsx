'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

type AuthMode = 'masuk' | 'daftar' | 'lupa' | 'konfirmasi'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('masuk')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function changeMode(next: AuthMode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const sb = supabaseBrowser()

    if (mode === 'lupa') {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      setBusy(false)
      if (error) return setError(error.message)
      setNotice('Jika email tersebut terdaftar, tautan reset kata sandi akan dikirim. Periksa Inbox dan Spam.')
      return
    }

    if (mode === 'konfirmasi') {
      const { error } = await sb.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setBusy(false)
      if (error) return setError(error.message)
      setNotice('Permintaan email konfirmasi berhasil dikirim. Periksa Inbox dan Spam, lalu gunakan tautan terbaru.')
      return
    }

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

    setNotice('Akun dikirim untuk pendaftaran. Periksa email konfirmasi, lalu gunakan tautan terbaru untuk mengaktifkan akun.')
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-semibold">
          {mode === 'masuk' ? 'Masuk ke ERP' : mode === 'daftar' ? 'Buat akun' : mode === 'lupa' ? 'Lupa kata sandi' : 'Kirim ulang konfirmasi'}
        </h1>
        {mode === 'daftar' && <input className="input" placeholder="Nama lengkap" value={name} onChange={(e) => setName(e.target.value)} required />}
        <input className="input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {(mode === 'masuk' || mode === 'daftar') && <input className="input" type="password" autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} placeholder="Kata sandi (min. 6 karakter)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : mode === 'daftar' ? 'Daftar' : mode === 'lupa' ? 'Kirim tautan reset' : 'Kirim ulang email konfirmasi'}
        </button>
        {mode === 'masuk' && <>
          <button type="button" className="w-full text-sm text-brand hover:underline" onClick={() => changeMode('lupa')}>Lupa kata sandi?</button>
          <button type="button" className="w-full text-sm text-brand hover:underline" onClick={() => changeMode('konfirmasi')}>Kirim ulang email konfirmasi</button>
        </>}
        <button type="button" className="w-full text-sm text-brand hover:underline" onClick={() => changeMode(mode === 'masuk' ? 'daftar' : 'masuk')}>
          {mode === 'masuk' ? 'Belum punya akun? Daftar' : 'Kembali ke Masuk'}
        </button>
      </form>
    </main>
  )
}
