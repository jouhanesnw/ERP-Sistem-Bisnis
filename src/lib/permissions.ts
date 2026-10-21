import { MODULES } from '@/config/modules'

export type Role = 'owner' | 'admin' | 'member'
export type Action = 'view' | 'create' | 'edit' | 'delete'
export type Perms = Record<string, Record<Action, boolean>>

type AccessRow = { module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }

export function buildPerms(role: Role, rows: AccessRow[]): Perms {
  const isAdmin = role !== 'member'
  const perms: Perms = {}
  for (const m of MODULES) {
    const open = m.alwaysVisible || (isAdmin && true)
    perms[m.key] = { view: !!open, create: isAdmin, edit: isAdmin, delete: isAdmin }
  }
  if (!isAdmin) {
    for (const r of rows) {
      const def = MODULES.find((m) => m.key === r.module)
      if (!def || def.adminOnly) continue
      perms[r.module] = { view: r.can_view, create: r.can_create, edit: r.can_edit, delete: r.can_delete }
    }
  }
  return perms
}

export const can = (perms: Perms, mod: string, act: Action = 'view') => !!perms[mod]?.[act]
