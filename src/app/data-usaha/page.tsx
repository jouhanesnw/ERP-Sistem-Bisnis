import BusinessCards from '@/modules/akun/BusinessCards'

export default function DataUsahaPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-brand">Akun ERP</p>
          <h1 className="mt-1 text-2xl font-semibold">Data Usaha Saya</h1>
          <p className="mt-2 text-sm text-ink/60">Pilih data usaha untuk masuk ke dashboardnya, atau tambahkan usaha baru.</p>
        </div>
        <BusinessCards />
      </div>
    </main>
  )
}
