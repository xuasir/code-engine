import type { CommandDef } from 'citty'

const _rDefault = (r: any): Promise<CommandDef> => (r.default || r) as Promise<CommandDef>

export default {
  prepare: () => import('./prepare').then(_rDefault),
}
