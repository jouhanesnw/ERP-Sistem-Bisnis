export default function AppLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Memuat halaman" role="status">
      <div className="rounded-xl bg-ink p-6 sm:p-8">
        <div className="h-3 w-28 rounded bg-white/20" />
        <div className="mt-4 h-7 w-64 max-w-full rounded bg-white/20" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-white/10" />
      </div>
      <div className="flex items-center gap-3 text-sm text-ink/60">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
        Memuat data halaman…
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="card space-y-4 p-5">
            <div className="h-10 w-10 rounded-xl bg-canvas" />
            <div className="h-4 w-32 rounded bg-canvas" />
            <div className="h-3 w-full rounded bg-canvas" />
            <div className="h-3 w-2/3 rounded bg-canvas" />
          </div>
        ))}
      </div>
    </div>
  )
}
