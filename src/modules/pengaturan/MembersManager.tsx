'use client'
import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'

type Row = { module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }
type Member = { id: string; role: string; profiles: { full_name: string | null; email: string | null } | null; module_access: Row[] }
type Mod = { key: string; label: string }

const COLS: { col: keyof Omit<Row, 'module'>; label: string }[] = [
  { col: 'can_view', label: 'Lihat' }, { col: 'can_create', label: 'Tambah' },
  { col: 'can_edit', label: 'Ubah' }, { col: 'can_delete', label: 'Hapus' },
]

export default function MembersManager({ companyId, initial, modules }: { companyId: string; initial: Member[]; modules: Mod[] }) {
  const sb = supabaseBrowser()
  const [members, setMembers] = useState(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState('member')

  async function toggle(m: Member, mod: string, col: keyof Omit<Row, 'module'>, value: boolean) {
    const cur = m.module_access.find((r) => r.module === mod) ?? { module: mod, can_view: false, can_create: false, can_edit: false, can_delete: false }
    const next: Row = { ...cur, [col]: value }
    if (col === 'can_view' && !value) Object.assign(next, { can_create: false, can_edit: false, can_delete: false })
    if (col !== 'can_view' && value) next.can_view = true
    const { error } = await sb.from('module_access').upsert({ membership_id: m.id, ...next }, { onConflict: 'membership_id,module' })
    if (error) return setMsg(error.message)
    setMsg(null)
    setMembers((ms) => ms.map((x) => x.id === m.id ? { ...x, module_access: [...x.module_access.filter((r) => r.module !== mod), next] } : x))
  }

  async function changeRole(m: Member, role: string) {
    const { error } = await sb.from('memberships').update({ role }).eq('id', m.id)
    if (error) return setMsg(error.message)
    setMembers((ms) => ms.map((x) => x.id === m.id ? { ...x, role } : x))
  }

  async function remove(m: Member) {
    if (!confirm(`Keluarkan ${m.profiles?.email ?? 'anggota ini'} dari perusahaan?`)) return
    const { error } = await sb.from('memberships').delete().eq('id', m.id)
    if (error) return setMsg(error.message)
    setMembers((ms) => ms.filter((x) => x.id !== m.id))
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await sb.rpc('add_member_by_email', { p_company: companyId, p_email: email, p_role: newRole })
    if (error) return setMsg(error.message)
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[14rem] flex-1 text-sm">Tambah anggota (email yang sudah terdaftar)
          <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="text-sm">Peran
          <select className="input mt-1" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="member">Member (akses diatur per modul)</option>
            <option value="admin">Admin (akses penuh)</option>
          </select>
        </label>
        <button className="btn btn-primary">Tambah</button>
      </form>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {members.map((m) => (
        <section key={m.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{m.profiles?.full_name ?? '—'}</p>
              <p className="truncate text-sm text-ink/60">{m.profiles?.email}</p>
            </div>
            {m.role === 'owner' ? <span className="rounded bg-brand-soft px-2 py-1 text-xs font-medium text-brand-dark">Owner</span> : (
              <>
                <select className="input w-auto" value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label="Peran">
                  <option value="member">Member</option><option value="admin">Admin</option>
                </select>
                <button className="btn" onClick={() => remove(m)}>Keluarkan</button>
              </>
            )}
          </div>
          {m.role === 'member' && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-ink/60">
                  <th className="py-2 pr-4 font-medium">Modul</th>
                  {COLS.map((c) => <th key={c.col} className="px-3 py-2 text-center font-medium">{c.label}</th>)}
                </tr></thead>
                <tbody>
                  {modules.map((mod) => {
                    const r = m.module_access.find((x) => x.module === mod.key)
                    return (
                      <tr key={mod.key} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4">{mod.label}</td>
                        {COLS.map((c) => (
                          <td key={c.col} className="px-3 py-2 text-center">
                            <input type="checkbox" className="h-4 w-4 accent-brand" checked={!!r?.[c.col]}
                              onChange={(e) => toggle(m, mod.key, c.col, e.target.checked)} aria-label={`${c.label} ${mod.label}`} />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {m.role === 'admin' && <p className="mt-3 text-sm text-ink/60">Admin punya akses penuh ke semua modul.</p>}
        </section>
      ))}
    </div>
  )
}
