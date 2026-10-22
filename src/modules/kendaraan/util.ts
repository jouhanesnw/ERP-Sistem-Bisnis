import { isoDate } from '@/lib/format'

export const selisihHari = (tgl: string) =>
  Math.round((new Date(tgl + 'T00:00:00').getTime() - new Date(isoDate(new Date()) + 'T00:00:00').getTime()) / 86400000)

export function waktuLabel(tgl: string, ingatkan = 30) {
  const n = selisihHari(tgl)
  if (n < 0) return { t: `Terlambat ${-n} hari`, c: 'bg-red-100 text-red-800' }
  if (n === 0) return { t: 'Hari ini', c: 'bg-amber-100 text-amber-800' }
  if (n <= ingatkan) return { t: `${n} hari lagi`, c: 'bg-amber-100 text-amber-800' }
  return { t: `${n} hari lagi`, c: 'bg-canvas text-ink/70' }
}

export function jamLalu(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`
  return `${Math.floor(s / 86400)} hari lalu`
}

export const JENIS_PAJAK: Record<string, string> = {
  pajak_tahunan: 'Pajak tahunan', stnk: 'STNK (5 tahunan)', kir: 'KIR', asuransi: 'Asuransi', lainnya: 'Lainnya',
}
