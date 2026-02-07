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

export type LayerSource
  = | { type: 'local', root: string, dynamic?: boolean }
    | { type: 'remote', root: string, dynamic?: false, version?: string }

export interface LayerDef {
  id: string
  source: LayerSource
  priority: number
  ignore?: string[]
  meta?: Record<string, unknown>
}

export interface ResourceScanConfig {
  enabled: boolean
  name: string
  pattern: string[]
  ignore?: string[]
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
