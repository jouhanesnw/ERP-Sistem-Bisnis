export const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

// Tanggal lokal (bukan UTC) supaya tidak mundur sehari di pagi hari WIB
export const isoDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const monthStart = () => { const d = new Date(); d.setDate(1); return isoDate(d) }
export const tglID = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
