import type { ResourceType } from './layer'

export interface LayerAssetMeta {
  layerId: string
  priority: number
  layerOrder: number
  scanKey: string
  routePath?: string
  routeScore?: number
}

export interface LayerAssetPath {
  root: string
  abs: string
  relative: string
  scan: string
}

export interface LayerAssetName {
  origin: string
  kebab: string
  pascal: string
  lazyKebab: string
  lazyPascal: string
  var: string
  safeVar: string
  safeLazyVar: string
  chunk: string
}

export interface LayerAssetLoader {
  relative: string
  importName?: string
  dynamicImport: () => string
}

export interface LayerAssetConfig {
  export: 'default' | 'named'
  prefetch?: boolean
  preload?: boolean
}

// 资产模型
export interface LayerAsset {
  id: string
  type: ResourceType
  key: string
  meta: LayerAssetMeta
  path: LayerAssetPath
  name: LayerAssetName
  config: LayerAssetConfig
  loader: LayerAssetLoader
  route?: {
    path: string
    score: number
  }
  overrides?: Partial<LayerAsset>[]
}

export interface ResourceManifest {
  resources: Record<ResourceType, LayerAsset[]>
  metadata: {
    generatedAt: string
    layerCount: number
    totalResources: number
  }
}
