import { notFound } from 'next/navigation'
import Denied from '@/components/Denied'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import { rupiah, tglID } from '@/lib/format'
import PrintButton from '@/modules/penjualan/PrintButton'
import type { Dokumen, Pelanggan } from '@/modules/penjualan/types'

export default async function CetakPage({ params }: { params: { id: string } }) {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'penjualan')) return <Denied module="Penjualan" />
  const sb = supabaseServer()
  const { data } = await sb.from('pj_dokumen_v').select('*').eq('id', params.id).eq('company_id', ctx.active.companyId).maybeSingle()
  if (!data) notFound()
  const d = data as Dokumen
  const [{ data: items }, { data: pel }] = await Promise.all([
    sb.from('pj_dokumen_item').select('*').eq('dokumen_id', d.id).order('urutan'),
    sb.from('pj_pelanggan').select('*').eq('id', d.pelanggan_id).maybeSingle(),
  ])
  const p = pel as Pelanggan | null
  const ppn = d.total - d.subtotal

  return (
    <div className="min-h-screen bg-white p-6 print:p-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">{ctx.active.name}</p>
            <p className="text-sm text-ink/60">{d.jenis === 'faktur' ? 'Faktur penjualan' : 'Penawaran harga'}</p>
          </div>
          <PrintButton />
        </div>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-ink/60">Kepada</p>
            <p className="font-medium">{d.pelanggan_nama}</p>
            {p?.alamat && <p>{p.alamat}</p>}
            {(p?.telepon || p?.email) && <p>{[p.telepon, p.email].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="text-right">
            <p className="font-medium">{d.nomor}</p>
            <p>Tanggal {tglID(d.tanggal)}</p>
            {d.batas_tanggal && <p>{d.jenis === 'faktur' ? 'Jatuh tempo' : 'Berlaku sampai'} {tglID(d.batas_tanggal)}</p>}
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60">
            <th className="py-2 font-medium">Deskripsi</th><th className="py-2 text-right font-medium">Jumlah</th>
            <th className="py-2 text-right font-medium">Harga</th><th className="py-2 text-right font-medium">Subtotal</th>
          </tr></thead>
          <tbody>
            {(items ?? []).map((i: any) => (
              <tr key={i.id} className="border-b border-line">
                <td className="py-2">{i.deskripsi}</td>
                <td className="py-2 text-right tabular-nums">{Number(i.qty)}</td>
                <td className="py-2 text-right tabular-nums">{rupiah(Number(i.harga))}</td>
                <td className="py-2 text-right tabular-nums">{rupiah(Number(i.qty) * Number(i.harga))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{rupiah(d.subtotal)}</span></div>
          {d.ppn_persen > 0 && <div className="flex justify-between"><span>PPN {Number(d.ppn_persen)}%</span><span className="tabular-nums">{rupiah(ppn)}</span></div>}
          <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums">{rupiah(d.total)}</span></div>
          {d.jenis === 'faktur' && d.terbayar > 0 && <>
            <div className="flex justify-between"><span>Sudah dibayar</span><span className="tabular-nums">{rupiah(d.terbayar)}</span></div>
            <div className="flex justify-between font-medium"><span>Sisa tagihan</span><span className="tabular-nums">{rupiah(d.sisa)}</span></div></>}
        </div>
        {d.catatan && <p className="text-sm"><span className="text-ink/60">Catatan: </span>{d.catatan}</p>}
      </div>
    </div>
  )
}
