export type ResourceType
  = | 'layouts'
    | 'components'
    | 'pages'
    | 'composables'
    | 'apis'
    | 'icons'
    | 'store'
    | 'utils'
    | 'styles'
    | 'plugins'

export interface ResourceScanConfig {
  enabled: boolean
  name: string
  pattern: string[]
  ignore?: string[]
}

export const LayerStandardResourceConfig: Record<ResourceType, ResourceScanConfig> = {
  pages: { enabled: true, name: 'pages', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
  components: { enabled: true, name: 'components', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
  layouts: { enabled: true, name: 'layouts', pattern: ['**/*.{vue,jsx,tsx}'], ignore: [] },
  composables: { enabled: true, name: 'composables', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
  apis: { enabled: true, name: 'apis', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
  icons: { enabled: true, name: 'icons', pattern: ['**/*.svg'], ignore: [] },
  store: { enabled: true, name: 'store', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: ['index.{ts,js}'] },
  utils: { enabled: true, name: 'utils', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
  styles: { enabled: true, name: 'styles', pattern: ['**/*.{css,scss,less}'], ignore: [] },
  plugins: { enabled: true, name: 'plugins', pattern: ['*.{ts,js}', '**/index.{ts,js}'], ignore: [] },
}

export type LayerSource
  = | { type: 'local', root: string, dynamic?: boolean }
    | { type: 'remote', root: string, dynamic?: false, version?: string }

export interface LayerMeta {
  __order?: number
  __origin?: 'user' | 'module'
  __scanPolicy?: 'user' | 'standard'
  [key: string]: unknown
}

export interface LayerDef {
  id: string
  source: LayerSource
  priority: number
  ignore?: string[]
  meta?: LayerMeta
}

export interface LayerRegistry {
  register: (def: LayerDef) => void
  unregister: (id: string) => void
  getOrdered: () => LayerDef[]
  get: (id: string) => LayerDef | undefined
  has: (id: string) => boolean
  ids: () => string[]
}

export interface LayerConfig {
  enabled: boolean
  defs: LayerDef[]
  remote?: {
    cacheDir?: string
    preferCache?: boolean
  }
  config?: Partial<Record<ResourceType, ResourceScanConfig>>
}
