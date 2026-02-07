import type { LayerAsset, LayerDef, ResourceScanConfig, ResourceType } from '@vona-js/schema'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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

  if (type === 'composables' || type === 'apis') {
    const exportNames = await parseNamedExports(join(layer.source.type === 'local' ? layer.source.root : '', relative), type)
    return exportNames.map((name) => {
      return buildAsset({
        layer,
        type,
        relative,
        scanKey: `${relative}#${name}`,
        keyName: name,
        importName: name,
        exportType: 'named',
      })
    })
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
  importName?: string
  exportType?: 'default' | 'named'
}

function buildAsset(options: BuildAssetOptions): LayerAsset {
  const { layer, type, relative, scanKey, keyName, importName, exportType = 'default' } = options
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
      export: exportType,
    },
    loader: {
      relative,
      importName,
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
      return toPascalByPath(normalized)
    case 'icons':
      return `Icon${toPascalByPath(normalized)}`
    default:
      return normalized || 'index'
  }
}

function isAllowedByType(type: ResourceType, normalized: string): boolean {
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) {
    return type === 'pages'
  }

  if (type === 'components') {
    return segments.length <= 2
  }

  if (type === 'layouts' || type === 'composables' || type === 'apis') {
    return segments.length === 1 || (segments.length === 2 && segments[1] === 'index')
  }

  return true
}

async function parseNamedExports(absPath: string, type: ResourceType): Promise<string[]> {
  if (!existsSync(absPath)) {
    return []
  }

  const content = await readFile(absPath, 'utf8')
  const matcher = /export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  const names = new Set<string>()
  let matched = matcher.exec(content)
  while (matched) {
    names.add(matched[1])
    matched = matcher.exec(content)
  }

  const filtered = [...names].filter((name) => {
    if (type === 'composables') {
      return name.startsWith('use') || name.startsWith('get')
    }
    if (type === 'apis') {
      return name.endsWith('Service')
    }
    return true
  })
  return filtered.sort()
}

function createPageRoute(keyName: string): { path: string, score: number } {
  if (!keyName || keyName === 'index') {
    return { path: '/', score: 10000 }
  }
  const segments = keyName.split('/').filter(Boolean)
  const mapped = segments.map((segment) => {
    const dynamic = parseDynamicSegment(segment)
    return dynamic ?? segment
  })
  const path = `/${mapped.join('/')}`
  return {
    path,
    score: getRouteScore(segments),
  }
}

function parseDynamicSegment(segment: string): string | null {
  const normalDynamic = segment.match(/^\[(.+)]$/)
  if (!normalDynamic) {
    return null
  }
  const name = normalDynamic[1]
  if (name.startsWith('...')) {
    return `:${name.slice(3)}(.*)`
  }
  return `:${name}`
}

function getRouteScore(segments: string[]): number {
  if (segments.length === 0) {
    return 10000
  }
  let score = 0
  for (const segment of segments) {
    score *= 10
    score += segment.startsWith('[') ? 1 : 3
  }
  return score + segments.length
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
    .replace(/\[(.+)]/g, '$1')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function toPascalToken(value: string): string {
  return value
    .replace(/\[(.+)]/g, '$1')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalize)
    .join('')
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}
