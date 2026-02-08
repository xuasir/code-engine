import type { LayerAsset, LayerDef, ResourceScanConfig, ResourceType } from '@vona-js/schema'
import { existsSync } from 'node:fs'
import fg from 'fast-glob'
import { join } from 'pathe'

const EXT_REG = /\.(vue|jsx|tsx|js|ts|svg|css|scss|less)$/i

export async function scanLayer(
  layer: LayerDef,
  config: Record<string, ResourceScanConfig>,
): Promise<LayerAsset[]> {
  if (layer.source.type !== 'local') {
    return []
  }

  const results: LayerAsset[] = []

  for (const [type, scanConfig] of Object.entries(config)) {
    if (!scanConfig.enabled) {
      continue
    }

    const scanRoot = join(layer.source.root, scanConfig.name)
    if (!existsSync(scanRoot)) {
      continue
    }

    const entries = await fg(scanConfig.pattern, {
      cwd: scanRoot,
      ignore: buildIgnore(layer, scanConfig),
      onlyFiles: true,
    })

    for (const entry of entries) {
      const relative = normalizeSlashes(join(scanConfig.name, entry))
      const assets = await scanEntry(relative, layer, type as ResourceType, scanConfig.name)
      results.push(...assets)
    }
  }

  return results
}

export function createAsset(entry: string, layer: LayerDef, type: ResourceType, rootName?: string): LayerAsset {
  const relative = normalizeSlashes(entry)
  const base = normalizeSegment(relative, type, rootName) || 'index'
  const keyName = resolveKeyName(type, base)
  return buildAsset({
    layer,
    type,
    relative,
    scanKey: relative,
    keyName,
  })
}

export async function scanSingleFile(
  path: string,
  layer: LayerDef,
  type: ResourceType,
  rootName?: string,
): Promise<LayerAsset[]> {
  const relative = rootName ? normalizeSlashes(join(rootName, path)) : normalizeSlashes(path)
  return scanEntry(relative, layer, type, rootName)
}

async function scanEntry(
  relative: string,
  layer: LayerDef,
  type: ResourceType,
  rootName?: string,
): Promise<LayerAsset[]> {
  const base = normalizeSegment(relative, type, rootName)

  if (!base) {
    if (type === 'pages') {
      return [buildAsset({
        layer,
        type,
        relative,
        scanKey: relative,
        keyName: 'index',
      })]
    }
    return []
  }

  if (!isAllowedByType(type, base)) {
    return []
  }

  return [buildAsset({
    layer,
    type,
    relative,
    scanKey: relative,
    keyName: resolveKeyName(type, base),
  })]
}

interface BuildAssetOptions {
  layer: LayerDef
  type: ResourceType
  relative: string
  scanKey: string
  keyName: string
}

function buildAsset(options: BuildAssetOptions): LayerAsset {
  const { layer, type, relative, scanKey, keyName } = options
  const root = layer.source.type === 'local' ? layer.source.root : ''
  const key = `${type}/${keyName}`
  const route = type === 'pages' ? createPageRoute(keyName) : undefined
  const nameInfo = parseName(keyName, type)

  return {
    id: `${layer.id}:${type}:${scanKey}`,
    type,
    key,
    meta: {
      layerId: layer.id,
      priority: layer.priority,
      layerOrder: getLayerOrder(layer),
      scanKey,
      routePath: route?.path,
      routeScore: route?.score,
    },
    path: {
      root,
      abs: join(root, relative),
      relative,
      scan: relative,
    },
    name: nameInfo,
    config: {
      export: 'default',
    },
    loader: {
      relative,
      dynamicImport: () => `import('${relative}')`,
    },
    route,
  }
}

function getLayerOrder(layer: LayerDef): number {
  const value = layer.meta?.__order
  return typeof value === 'number' ? value : 0
}

function resolveKeyName(type: ResourceType, normalized: string): string {
  switch (type) {
    case 'components':
    case 'layouts':
    case 'icons':
      return toPascalByPath(normalized)
    default:
      return normalized || 'index'
  }
}

function isAllowedByType(type: ResourceType, normalized: string): boolean {
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) {
    return type === 'pages'
  }

  if (type === 'composables' || type === 'apis' || type === 'plugins' || type === 'store' || type === 'utils') {
    return segments.length <= 1
  }

  return true
}

interface ParsedPageSegment {
  pathSegment?: string
  weight?: number
}

function createPageRoute(keyName: string): { path: string, score: number } {
  if (!keyName || keyName === 'index') {
    return { path: '/', score: 0 }
  }

  const sourceSegments = keyName.split('/').filter(Boolean)
  const routeSegments: string[] = []
  const weights: number[] = []

  for (const segment of sourceSegments) {
    const parsed = parsePageSegment(segment)
    if (!parsed.pathSegment || typeof parsed.weight !== 'number') {
      continue
    }
    routeSegments.push(parsed.pathSegment)
    weights.push(parsed.weight)
  }

  const path = routeSegments.length > 0 ? `/${routeSegments.join('/')}` : '/'

  return {
    path,
    score: getRouteScore(weights),
  }
}

function parsePageSegment(segment: string): ParsedPageSegment {
  if (/^\(.+\)$/.test(segment)) {
    return {}
  }

  const optional = segment.match(/^\[\[(.+)\]\]$/)
  if (optional) {
    return {
      pathSegment: `:${optional[1]}?`,
      weight: 1,
    }
  }

  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/)
  if (catchAll) {
    return {
      pathSegment: `:${catchAll[1]}(.*)*`,
      weight: 0,
    }
  }

  const dynamic = segment.match(/^\[(.+)\]$/)
  if (dynamic) {
    return {
      pathSegment: `:${dynamic[1]}`,
      weight: 2,
    }
  }

  return {
    pathSegment: segment,
    weight: 3,
  }
}

function getRouteScore(weights: number[]): number {
  if (weights.length === 0) {
    return 0
  }

  let score = 0
  for (const weight of weights) {
    score = (score * 4) + weight
  }
  return score
}

function parseName(keyName: string, type: ResourceType): LayerAsset['name'] {
  const parts = keyName.split('/').filter(Boolean)
  const normalizedParts = parts.length > 0 ? parts : ['index']
  const origin = normalizedParts[normalizedParts.length - 1]
  const kebabBase = normalizedParts.map(toKebabToken).filter(Boolean).join('-') || type
  const pascalBase = normalizedParts.map(toPascalToken).filter(Boolean).join('') || 'Index'
  const varBase = camelCase(kebabBase)
  const lazyKebabBase = `lazy-${kebabBase}`
  const lazyPascalBase = `Lazy${pascalBase}`
  const safeVarBase = `safe${capitalize(varBase)}`
  const safeLazyVarBase = `safe${lazyPascalBase}`
  const chunk = `${type.slice(0, 1)}-${kebabBase}`

  return {
    origin,
    kebab: kebabBase,
    pascal: pascalBase,
    lazyKebab: lazyKebabBase,
    lazyPascal: lazyPascalBase,
    var: varBase,
    safeVar: safeVarBase,
    safeLazyVar: safeLazyVarBase,
    chunk,
  }
}

function buildIgnore(layer: LayerDef, scanConfig: ResourceScanConfig): string[] {
  return [
    '**/_*',
    '**/_*/**',
    '**/.*',
    '**/.*/**',
    'node_modules',
    ...(layer.ignore ?? []),
    ...(scanConfig.ignore ?? []),
  ]
}

function normalizeSegment(relative: string, type: ResourceType, rootName?: string): string {
  let value = normalizeSlashes(relative).replace(/^\//, '')

  if (rootName) {
    const prefix = `${normalizeSlashes(rootName).replace(/^\//, '').replace(/\/$/, '')}/`
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length)
    }
  }
  else if (value.startsWith(`${type}/`)) {
    value = value.slice(type.length + 1)
  }

  value = value.replace(EXT_REG, '')
  value = value.replace(/(^|\/)index$/, '$1')
  return value.replace(/^\/+|\/+$/g, '')
}

function toPascalByPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(toPascalToken)
    .join('')
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function camelCase(str: string): string {
  return str
    .split('-')
    .map((part, index) => (index === 0 ? part : capitalize(part)))
    .join('')
}

function toKebabToken(value: string): string {
  return value
    .replace(/\[(.+)\]/g, '$1')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function toPascalToken(value: string): string {
  return value
    .replace(/\[(.+)\]/g, '$1')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalize)
    .join('')
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}
