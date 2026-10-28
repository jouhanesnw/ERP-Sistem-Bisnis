'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Building2, Mail, MapPin, Phone, Search, UserRound, Users, UserSquare2 } from 'lucide-react'
import type { ContactKind, ContactRecord } from './contacts'

type Filter = 'Semua' | ContactKind

const FILTERS: Filter[] = ['Semua', 'Pelanggan', 'Pemasok', 'Karyawan']
const KIND_STYLE: Record<ContactKind, string> = {
  Pelanggan: 'border-blue-200 bg-blue-50 text-blue-800',
  Pemasok: 'border-orange-200 bg-orange-50 text-orange-800',
  Karyawan: 'border-purple-200 bg-purple-50 text-purple-800',
}
const KIND_ICON = {
  Pelanggan: Users,
  Pemasok: Building2,
  Karyawan: UserSquare2,
}

export default function ContactManager({ initial, initialError, availableKinds }: {
  initial: ContactRecord[]
  initialError: string | null
  availableKinds: ContactKind[]
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('Semua')
  const [status, setStatus] = useState<'Aktif' | 'Semua status'>('Aktif')

  const counts = useMemo(() => ({
    Semua: initial.length,
    Pelanggan: initial.filter((item) => item.kind === 'Pelanggan').length,
    Pemasok: initial.filter((item) => item.kind === 'Pemasok').length,
    Karyawan: initial.filter((item) => item.kind === 'Karyawan').length,
  }), [initial])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id')
    return initial.filter((item) => {
      if (filter !== 'Semua' && item.kind !== filter) return false
      if (status === 'Aktif' && !item.active) return false
      if (!query) return true
      return [
        item.name, item.code, item.phone, item.email, item.address, item.detail, item.kind,
      ].some((value) => (value ?? '').toLocaleLowerCase('id').includes(query))
    }).sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [initial, search, filter, status])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Kontak</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink/60">Direktori terpadu untuk mencari informasi kontak pelanggan, pemasok, dan karyawan. Data ditampilkan dari master masing-masing agar tidak perlu diinput ulang.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link className="btn" href="/penjualan/pelanggan">Kelola Pelanggan</Link>
          <Link className="btn" href="/pembelian/pemasok">Kelola Pemasok</Link>
          <Link className="btn" href="/pengaturan/karyawan">Kelola Karyawan</Link>
        </div>
      </div>

      {initialError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{initialError}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary title="Total kontak" count={counts.Semua} icon={UserRound} active={filter === 'Semua'} onClick={() => setFilter('Semua')} />
        {availableKinds.includes('Pelanggan') && <Summary title="Pelanggan" count={counts.Pelanggan} icon={Users} active={filter === 'Pelanggan'} onClick={() => setFilter('Pelanggan')} />}
        {availableKinds.includes('Pemasok') && <Summary title="Pemasok" count={counts.Pemasok} icon={Building2} active={filter === 'Pemasok'} onClick={() => setFilter('Pemasok')} />}
        {availableKinds.includes('Karyawan') && <Summary title="Karyawan" count={counts.Karyawan} icon={UserSquare2} active={filter === 'Karyawan'} onClick={() => setFilter('Karyawan')} />}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-md">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" />
          <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, telepon, email, alamat..." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.filter((value) => value === 'Semua' || availableKinds.includes(value)).map((value) => (
            <button key={value} type="button" className={`btn ${filter === value ? 'border-brand bg-brand-soft text-brand-dark' : ''}`} onClick={() => setFilter(value)}>
              {value}
            </button>
          ))}
          <select className="input w-auto min-w-[145px]" value={status} onChange={(e) => setStatus(e.target.value as 'Aktif' | 'Semua status')} aria-label="Filter status kontak">
            <option value="Aktif">Kontak aktif</option>
            <option value="Semua status">Semua status</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <div>
            <h2 className="font-semibold">Daftar Kontak</h2>
            <p className="mt-1 text-xs text-ink/55">Menampilkan {filtered.length} dari {initial.length} kontak yang dapat kamu akses.</p>
          </div>
          <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink/70">{status}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-ink/60">
                <th className="p-3 font-medium">Nama Kontak</th>
                <th className="p-3 font-medium">Jenis</th>
                <th className="p-3 font-medium">Telepon</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Alamat / Keterangan</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const Icon = KIND_ICON[item.kind]
                return (
                  <tr key={`${item.kind}-${item.id}`} className={`border-b border-line last:border-0 align-top ${item.active ? '' : 'text-ink/45'}`}>
                    <td className="p-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink/65"><Icon size={16} /></span>
                        <div className="min-w-0">
                          <div className="font-medium text-ink">{item.name}</div>
                          {item.code && <div className="mt-1 text-xs text-ink/50">{item.code}</div>}
                          {item.detail && <div className="mt-1 text-xs text-ink/55">{item.detail}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${KIND_STYLE[item.kind]}`}>{item.kind}</span></td>
                    <td className="p-3">
                      {item.phone ? <a className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-brand" href={`tel:${item.phone.replace(/[^+\\d]/g, '')}`}><Phone size={13} />{item.phone}</a> : <span className="text-ink/35">—</span>}
                    </td>
                    <td className="p-3">
                      {item.email ? <a className="inline-flex max-w-[220px] items-center gap-1.5 break-all hover:text-brand" href={`mailto:${item.email}`}><Mail size={13} />{item.email}</a> : <span className="text-ink/35">—</span>}
                    </td>
                    <td className="p-3">
                      {item.address ? <span className="inline-flex max-w-[260px] items-start gap-1.5 whitespace-normal"><MapPin size={13} className="mt-0.5 shrink-0 text-ink/40" />{item.address}</span> : <span className="text-ink/35">—</span>}
                    </td>
                    <td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{item.active ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td className="whitespace-nowrap p-3 text-right"><Link className="btn" href={item.href}>Buka data</Link></td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={7} className="p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-ink/55"><Search size={22} /></div>
                <p className="mt-3 font-medium">{initial.length ? 'Kontak tidak ditemukan' : 'Belum ada data kontak'}</p>
                <p className="mt-1 text-sm text-ink/55">{initial.length ? 'Coba kata pencarian atau filter yang berbeda.' : 'Kontak akan muncul di sini setelah data pelanggan, pemasok, atau karyawan ditambahkan.'}</p>
              </td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Summary({ title, count, icon: Icon, active, onClick }: {
  title: string
  count: number
  icon: typeof UserRound
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={`card flex min-w-0 items-center gap-3 p-4 text-left transition hover:border-brand/50 ${active ? 'border-brand ring-1 ring-brand/20' : ''}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink/65"><Icon size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink/60">{title}</span>
        <span className="mt-0.5 block text-2xl font-semibold tabular-nums">{count}</span>
      </span>
    </button>
  )
}
