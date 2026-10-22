let loading: Promise<void> | null = null

// Memuat Google Maps JavaScript API sekali saja. Kunci API dibatasi per domain di Google Cloud Console.
export function loadGoogleMaps(key: string): Promise<void> {
  const w = window as any
  if (w.google?.maps?.importLibrary) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    w.__gmapsReady = () => resolve()
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__gmapsReady`
    s.async = true
    s.onerror = () => { loading = null; reject(new Error('Google Maps gagal dimuat. Periksa API key dan pembatasan domainnya.')) }
    document.head.appendChild(s)
  })
  return loading
}
