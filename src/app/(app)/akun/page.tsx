import { getAppContext } from '@/lib/context'
import ProfileManager from '@/modules/akun/ProfileManager'

export default async function AccountPage() {
  const ctx = await getAppContext()

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-sm text-ink/60">Pengaturan pribadi · berlaku untuk semua data usaha</p>
        <h1 className="mt-1 text-2xl font-semibold">Akun & Profil</h1>
        <p className="mt-1 text-sm text-ink/60">Kelola nama profil dan keamanan akun ERP. Pengaturan ini tidak mengubah nama atau data perusahaan.</p>
      </div>
      <ProfileManager initialName={ctx.user.fullName} email={ctx.user.email} />
    </div>
  )
}
