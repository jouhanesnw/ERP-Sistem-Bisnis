export default function Denied({ module }: { module: string }) {
  return (
    <div className="card max-w-lg p-6">
      <h1 className="text-lg font-semibold">Akses ditolak</h1>
      <p className="mt-1 text-sm text-ink/60">Anda tidak punya akses ke modul {module}. Minta admin perusahaan untuk membukanya.</p>
    </div>
  )
}
