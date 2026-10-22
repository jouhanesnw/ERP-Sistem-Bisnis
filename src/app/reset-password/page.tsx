'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter.')
      return
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.')
      return
    }

    setBusy(true)
    const { error } = await supabaseBrowser().auth.updateUser({ password })
    setBusy(false)

    if (error) {
      setError('Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan reset baru dari halaman Masuk.')
      return
    }

    setNotice('Kata sandi berhasil diubah. Mengarahkan ke dashboard…')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-xl font-semibold">Atur ulang kata sandi</h1>
        <p className="text-sm text-ink/60">Buat kata sandi baru untuk akun ERP kamu.</p>
        <input className="input" type="password" autoComplete="new-password" placeholder="Kata sandi baru (min. 6 karakter)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className="input" type="password" autoComplete="new-password" placeholder="Ulangi kata sandi baru" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan kata sandi baru'}</button>
      </form>
    </main>
  )
}
