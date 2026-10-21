import { notFound } from 'next/navigation'
import Denied from '@/components/Denied'
import { getAppContext } from '@/lib/context'
import { can } from '@/lib/permissions'
import { supabaseServer } from '@/lib/supabase/server'
import { rupiah, tglID } from '@/lib/format'
import PrintButton from '@/modules/pembelian/PrintButton'
import type { Dokumen, Pemasok } from '@/modules/pembelian/types'

export default async function CetakPage({ params }: { params: { id: string } }) {
  const ctx = await getAppContext()
  if (!can(ctx.perms, 'pembelian')) return <Denied module="Pembelian" />
  const sb = supabaseServer()
  const { data } = await sb.from('pb_dokumen_v').select('*').eq('id', params.id).eq('company_id', ctx.active.companyId).maybeSingle()
  if (!data) notFound()
  const d = data as Dokumen
  const [{ data: items }, { data: pemasokData }] = await Promise.all([
    sb.from('pb_dokumen_item').select('*').eq('dokumen_id', d.id).order('urutan'),
    sb.from('pb_pemasok').select('*').eq('id', d.pemasok_id).maybeSingle(),
  ])
  const p = pemasokData as Pemasok | null
  const nilaiPpn = d.total - d.subtotal

  return (
    <div className="min-h-screen bg-white p-6 print:p-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">{ctx.active.name}</p>
            <p className="text-sm text-ink/60">{d.jenis === 'faktur' ? 'Faktur pembelian' : 'Pesanan pembelian'}</p>
          </div>
          <PrintButton />
        </div>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-ink/60">Kepada</p><p className="font-medium">{d.pemasok_nama}</p>
            {p?.alamat && <p>{p.alamat}</p>}
            {(p?.telepon || p?.email) && <p>{[p.telepon, p.email].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="text-right">
            <p className="font-medium">{d.nomor}</p>
            {d.no_referensi && <p>Ref. pemasok {d.no_referensi}</p>}
            <p>Tanggal {tglID(d.tanggal)}</p>
            {d.batas_tanggal && <p>{d.jenis === 'faktur' ? 'Jatuh tempo' : 'Estimasi tiba'} {tglID(d.batas_tanggal)}</p>}
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink/60"><th className="py-2 font-medium">Deskripsi</th><th className="py-2 text-right font-medium">Jumlah</th><th className="py-2 text-right font-medium">Harga</th><th className="py-2 text-right font-medium">Subtotal</th></tr></thead>
          <tbody>{(items ?? []).map((i: any) => <tr key={i.id} className="border-b border-line">
            <td className="py-2">{i.deskripsi}</td><td className="py-2 text-right tabular-nums">{Number(i.qty)}</td>
            <td className="py-2 text-right tabular-nums">{rupiah(Number(i.harga))}</td><td className="py-2 text-right tabular-nums">{rupiah(Number(i.qty) * Number(i.harga))}</td>
          </tr>)}</tbody>
        </table>
        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{rupiah(d.subtotal)}</span></div>
          {d.ppn_persen > 0 && <div className="flex justify-between"><span>PPN {Number(d.ppn_persen)}%</span><span className="tabular-nums">{rupiah(nilaiPpn)}</span></div>}
          <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums">{rupiah(d.total)}</span></div>
          {d.jenis === 'faktur' && d.terbayar > 0 && <>
            <div className="flex justify-between"><span>Sudah dibayar</span><span className="tabular-nums">{rupiah(d.terbayar)}</span></div>
            <div className="flex justify-between font-medium"><span>Sisa tagihan</span><span className="tabular-nums">{rupiah(d.sisa)}</span></div>
          </>}
        </div>
        {d.catatan && <p className="text-sm"><span className="text-ink/60">Catatan: </span>{d.catatan}</p>}
      </div>
    </div>
  )
}
