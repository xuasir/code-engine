import type { LayerAsset, LayerDef, ResourceScanConfig, ResourceType } from '@vona-js/schema'
import { existsSync } from 'node:fs'
import {
  BASE_RESOURCE_IGNORE,
  camelCase,
  capitalize,
  EXT_REG,
  normalizeSlashes,
  toKebabToken,
  toPascalByPath,
  toPascalToken,
} from '@vona-js/utils'
import fg from 'fast-glob'
import { join } from 'pathe'

const FLAT_RESOURCE_TYPES = new Set<ResourceType>(['composables', 'apis', 'plugins', 'store', 'utils'])

interface ScanTaskContext {
  type: ResourceType
  rootPrefix: string
  typePrefix: string
  isFlatType: boolean
}

interface ScanTask extends ScanTaskContext {
  scanRoot: string
  pattern: string[]
  ignore: string[]
}

interface ScanCache {
  nameCache: Map<string, LayerAsset['name']>
  routeCache: Map<string, { path: string, score: number }>
}

interface BuildAssetOptions {
  layer: LayerDef
  type: ResourceType
  relative: string
  scanKey: string
  keyName: string
}

export async function scanLayer(
  layer: LayerDef,
  config: Record<string, ResourceScanConfig>,
): Promise<LayerAsset[]> {
  if (layer.source.type !== 'local') {
    return []
  }

  const tasks = createScanTasks(layer, config)
  if (tasks.length === 0) {
    return []
  }

  const entriesByTask = await Promise.all(tasks.map(task => scanTask(task)))
  const cache: ScanCache = {
    nameCache: new Map(),
    routeCache: new Map(),
  }
  const results: LayerAsset[] = []

  // 并发扫描后按任务创建顺序回收，保证输出稳定
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const entries = entriesByTask[i]
    for (const entry of entries) {
      const relative = toRelativePath(entry, task)
      const asset = scanEntry(relative, layer, task, cache)
      if (asset) {
        results.push(asset)
      }
    }
  }

  return results
}

export function createAsset(entry: string, layer: LayerDef, type: ResourceType, rootName?: string): LayerAsset {
  const relative = normalizeSlashes(entry)
  const context = createTaskContext(type, rootName)
  const base = normalizeSegment(relative, context) || 'index'
  const keyName = resolveKeyName(type, base)
  return buildAsset({
    layer,
    type,
    relative,
    scanKey: relative,
    keyName,
  })
}

export function scanSingleFile(
  path: string,
  layer: LayerDef,
  type: ResourceType,
  rootName?: string,
): LayerAsset[] {
  const context = createTaskContext(type, rootName)
  const relative = rootName ? normalizeSlashes(join(rootName, path)) : normalizeSlashes(path)
  const asset = scanEntry(relative, layer, context)
  return asset ? [asset] : []
}

function scanEntry(
  relative: string,
  layer: LayerDef,
  context: ScanTaskContext,
  cache?: ScanCache,
): LayerAsset | undefined {
  const base = normalizeSegment(relative, context)

  if (!base) {
    if (context.type === 'pages') {
      return buildAsset({
        layer,
        type: context.type,
        relative,
        scanKey: relative,
        keyName: 'index',
      }, cache)
    }
    return undefined
  }

  if (!isAllowedByType(base, context)) {
    return undefined
  }

  return buildAsset({
    layer,
    type: context.type,
    relative,
    scanKey: relative,
    keyName: resolveKeyName(context.type, base),
  }, cache)
}

function buildAsset(options: BuildAssetOptions, cache?: ScanCache): LayerAsset {
  const { layer, type, relative, scanKey, keyName } = options
  const root = layer.source.type === 'local' ? layer.source.root : ''
  const key = `${type}/${keyName}`
  const route = type === 'pages'
    ? resolvePageRoute(keyName, cache)
    : undefined
  const nameInfo = resolveNameInfo(keyName, type, cache)

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
    name: { ...nameInfo },
    config: {
      export: 'default',
    },
    loader: {
      relative,
      dynamicImport: () => `import('${relative}')`,
    },
    route: route ? { ...route } : undefined,
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

function isAllowedByType(normalized: string, context: ScanTaskContext): boolean {
  if (!normalized) {
    return context.type === 'pages'
  }

  if (!context.isFlatType) {
    return true
  }

  return !normalized.includes('/')
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

function resolveNameInfo(
  keyName: string,
  type: ResourceType,
  cache?: ScanCache,
): LayerAsset['name'] {
  if (!cache) {
    return parseName(keyName, type)
  }

  const cacheKey = `${type}:${keyName}`
  const cached = cache.nameCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const value = parseName(keyName, type)
  cache.nameCache.set(cacheKey, value)
  return value
}

function resolvePageRoute(
  keyName: string,
  cache?: ScanCache,
): { path: string, score: number } {
  if (!cache) {
    return createPageRoute(keyName)
  }

  const cached = cache.routeCache.get(keyName)
  if (cached) {
    return cached
  }

  const value = createPageRoute(keyName)
  cache.routeCache.set(keyName, value)
  return value
}

function buildIgnore(layer: LayerDef, scanConfig: ResourceScanConfig): string[] {
  return [
    ...BASE_RESOURCE_IGNORE,
    ...(layer.ignore ?? []),
    ...(scanConfig.ignore ?? []),
  ]
}

function normalizeRootName(rootName: string | undefined): string {
  if (!rootName) {
    return ''
  }
  return normalizeSlashes(rootName).replace(/^\/+|\/+$/g, '')
}

function createTaskContext(type: ResourceType, rootName?: string): ScanTaskContext {
  const normalizedRootName = normalizeRootName(rootName)
  return {
    type,
    rootPrefix: normalizedRootName ? `${normalizedRootName}/` : '',
    typePrefix: `${type}/`,
    isFlatType: FLAT_RESOURCE_TYPES.has(type),
  }
}

function createScanTasks(layer: LayerDef, config: Record<string, ResourceScanConfig>): ScanTask[] {
  const tasks: ScanTask[] = []
  for (const [rawType, scanConfig] of Object.entries(config)) {
    if (!scanConfig.enabled) {
      continue
    }

    const type = rawType as ResourceType
    const scanRoot = join(layer.source.root, scanConfig.name)
    if (!existsSync(scanRoot)) {
      continue
    }

    const context = createTaskContext(type, scanConfig.name)
    tasks.push({
      ...context,
      scanRoot,
      pattern: scanConfig.pattern,
      ignore: buildIgnore(layer, scanConfig),
    })
  }
  return tasks
}

async function scanTask(task: ScanTask): Promise<string[]> {
  return fg(task.pattern, {
    cwd: task.scanRoot,
    ignore: task.ignore,
    onlyFiles: true,
  })
}

function toRelativePath(entry: string, task: ScanTask): string {
  const normalizedEntry = normalizeSlashes(entry)
  if (task.rootPrefix) {
    return `${task.rootPrefix}${normalizedEntry}`
  }
  return normalizedEntry
}

function normalizeSegment(relative: string, context: ScanTaskContext): string {
  let value = normalizeSlashes(relative).replace(/^\//, '')

  if (context.rootPrefix) {
    if (value.startsWith(context.rootPrefix)) {
      value = value.slice(context.rootPrefix.length)
    }
  }
  else if (value.startsWith(context.typePrefix)) {
    value = value.slice(context.typePrefix.length)
  }

  value = value.replace(EXT_REG, '')
  value = value.replace(/(^|\/)index$/, '$1')
  return value.replace(/^\/+|\/+$/g, '')
}
