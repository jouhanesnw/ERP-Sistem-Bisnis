'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, UserRound } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function ProfileManager({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    const fullName = name.trim()
    if (!fullName) {
      setProfileError('Nama lengkap tidak boleh kosong.')
      return
    }

    setProfileBusy(true)
    setProfileError(null)
    setProfileMessage(null)
    const sb = supabaseBrowser()
    const { data: { user }, error: userError } = await sb.auth.getUser()
    if (userError || !user) {
      setProfileBusy(false)
      setProfileError('Sesi login tidak ditemukan. Silakan masuk kembali.')
      return
    }

    const { error: metadataError } = await sb.auth.updateUser({ data: { full_name: fullName } })
    if (metadataError) {
      setProfileBusy(false)
      setProfileError(metadataError.message)
      return
    }

    const { error: profileErrorResult } = await sb
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id)

    setProfileBusy(false)
    if (profileErrorResult) {
      setProfileError('Nama akun diperbarui, tetapi profil database gagal disinkronkan: ' + profileErrorResult.message)
      router.refresh()
      return
    }

    setProfileMessage('Profil berhasil disimpan.')
    router.refresh()
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordMessage(null)

    if (password.length < 6) {
      setPasswordError('Kata sandi baru minimal 6 karakter.')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak sama.')
      return
    }

    setPasswordBusy(true)
    const { error } = await supabaseBrowser().auth.updateUser({ password })
    setPasswordBusy(false)
    if (error) {
      setPasswordError(error.message)
      return
    }

    setPassword('')
    setConfirmPassword('')
    setPasswordMessage('Kata sandi berhasil diubah.')
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={saveProfile} className="card space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><UserRound size={21} /></span>
          <div>
            <h2 className="font-semibold">Profil Pengguna</h2>
            <p className="text-sm text-ink/60">Informasi akunmu, berlaku di semua data usaha.</p>
          </div>
        </div>
        <label className="block text-sm font-medium">Nama lengkap
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" required />
        </label>
        <label className="block text-sm font-medium">Email login
          <input className="input mt-1 bg-canvas text-ink/60" type="email" value={email} readOnly />
          <span className="mt-1 block text-xs font-normal text-ink/50">Email ditampilkan sebagai identitas login. Perubahan email memerlukan proses verifikasi tersendiri.</span>
        </label>
        {profileError && <p role="alert" className="text-sm text-red-600">{profileError}</p>}
        {profileMessage && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} />{profileMessage}</p>}
        <button className="btn btn-primary w-full" disabled={profileBusy}>{profileBusy ? 'Menyimpan…' : 'Simpan Profil'}</button>
      </form>

      <form onSubmit={changePassword} className="card space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><KeyRound size={21} /></span>
          <div>
            <h2 className="font-semibold">Keamanan Akun</h2>
            <p className="text-sm text-ink/60">Ganti kata sandi akun ERP-mu.</p>
          </div>
        </div>
        <label className="block text-sm font-medium">Kata sandi baru
          <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
        </label>
        <label className="block text-sm font-medium">Konfirmasi kata sandi baru
          <input className="input mt-1" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
        </label>
        {passwordError && <p role="alert" className="text-sm text-red-600">{passwordError}</p>}
        {passwordMessage && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} />{passwordMessage}</p>}
        <button className="btn btn-primary w-full" disabled={passwordBusy}>{passwordBusy ? 'Mengubah…' : 'Ganti Kata Sandi'}</button>
      </form>
    </div>
  )
}
