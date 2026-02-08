import type { LayerAsset, LayerDef, OVFSMutation, ResourceScanConfig, ResourceType } from '@vona-js/schema'
import { existsSync } from 'node:fs'
import { BASE_RESOURCE_IGNORE, normalizeSlashes } from '@vona-js/utils'
import chokidar from 'chokidar'
import micromatch from 'micromatch'
import { join, relative } from 'pathe'
import { scanLayer, scanSingleFile } from './scanner'

export type LayerType = 'static' | 'dynamic'

export interface Layer {
  def: LayerDef
  type: LayerType
  getAssets: () => LayerAsset[]
  start: () => Promise<void>
  stop: () => void
  onMutation: (callback: (mutations: LayerMutation[]) => void) => void
}

export type LayerMutation = OVFSMutation & {
  reason: 'add' | 'change' | 'unlink'
}

export interface LayerOptions {
  def: LayerDef
  config: Record<string, ResourceScanConfig>
}

interface WatchTarget {
  type: ResourceType
  scanConfig: ResourceScanConfig
  rootName: string
}

function isWatchResourceLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: string }).code
  return code === 'EMFILE' || code === 'ENOSPC'
}

function buildLayerIgnore(def: LayerDef): string[] {
  return [
    ...BASE_RESOURCE_IGNORE,
    ...(def.ignore ?? []),
  ]
}

function buildWatchTargets(def: LayerDef, config: Record<string, ResourceScanConfig>): WatchTarget[] {
  if (def.source.type !== 'local') {
    return []
  }

  const targets: WatchTarget[] = []
  for (const [type, scanConfig] of Object.entries(config)) {
    if (!scanConfig.enabled) {
      continue
    }
    const rootName = normalizeSlashes(scanConfig.name).replace(/^\/+|\/+$/g, '')
    const root = join(def.source.root, rootName)
    if (!existsSync(root)) {
      continue
    }
    targets.push({
      type: type as ResourceType,
      scanConfig,
      rootName,
    })
  }
  return targets
}

function matchTargetFile(filePath: string, target: WatchTarget, layerRoot: string): string | null {
  const relativePath = normalizeSlashes(relative(layerRoot, filePath))
  if (relativePath.startsWith('../') || relativePath === target.rootName) {
    return null
  }

  const prefix = `${target.rootName}/`
  if (!relativePath.startsWith(prefix)) {
    return null
  }

  const scanRelative = relativePath.slice(prefix.length)
  const matched = micromatch.isMatch(scanRelative, target.scanConfig.pattern, {
    ignore: target.scanConfig.ignore ?? [],
  })
  if (!matched) {
    return null
  }
  return scanRelative
}

export function createStaticLayer(options: LayerOptions): Layer {
  const { def, config } = options
  let assets: LayerAsset[] = []

  const start = async (): Promise<void> => {
    if (def.source.type === 'local') {
      assets = await scanLayer(def, config)
    }
  }

  const stop = (): void => {
    assets = []
  }

  const getAssets = (): LayerAsset[] => assets

  const onMutation = (_callback: (mutations: LayerMutation[]) => void): void => {
    // 静态层不支持变更
  }

  return {
    def,
    type: 'static',
    getAssets,
    start,
    stop,
    onMutation,
  }
}

export function createDynamicLayer(options: LayerOptions): Layer {
  const { def, config } = options
  const watchers: Array<ReturnType<typeof chokidar.watch>> = []
  const assetsByFile = new Map<string, LayerAsset[]>()
  const callbacks: Array<(mutations: LayerMutation[]) => void> = []

  const emitMutation = (mutations: LayerMutation[]): void => {
    if (mutations.length === 0) {
      return
    }
    callbacks.forEach(cb => cb(mutations))
  }

  const start = async (): Promise<void> => {
    if (def.source.type !== 'local') {
      return
    }

    const initialAssets = await scanLayer(def, config)
    for (const asset of initialAssets) {
      const list = assetsByFile.get(asset.path.relative) ?? []
      list.push(asset)
      assetsByFile.set(asset.path.relative, list)
    }

    const targets = buildWatchTargets(def, config)
    if (targets.length === 0) {
      return
    }

    const createWatcher = (usePolling: boolean): ReturnType<typeof chokidar.watch> => {
      return chokidar.watch(def.source.root, {
        ignored: buildLayerIgnore(def),
        persistent: true,
        ignoreInitial: true,
        usePolling,
        interval: 120,
        binaryInterval: 300,
      })
    }

    // 动态更新仅重算当前文件关联的资源键，避免全量重扫。
    const handleFileForTarget = async (
      event: 'add' | 'change' | 'unlink',
      target: WatchTarget,
      relativePath: string,
    ): Promise<void> => {
      const rawPath = normalizeSlashes(join(target.scanConfig.name, relativePath))
      const previousAssets = assetsByFile.get(rawPath) ?? []
      const nextAssets = event === 'unlink'
        ? []
        : await scanSingleFile(relativePath, def, target.type, target.scanConfig.name)
      const mutations: LayerMutation[] = []

      for (const oldAsset of previousAssets) {
        mutations.push({
          op: 'removeById',
          id: oldAsset.id,
          reason: event,
        })
      }
      assetsByFile.delete(rawPath)

      for (const asset of nextAssets) {
        mutations.push({
          op: 'upsert',
          asset,
          reason: event,
        })
      }
      if (nextAssets.length > 0) {
        assetsByFile.set(rawPath, nextAssets)
      }
      emitMutation(mutations)
    }

    const handleFile = async (event: 'add' | 'change' | 'unlink', filePath: string): Promise<void> => {
      for (const target of targets) {
        const relativePath = matchTargetFile(filePath, target, def.source.root)
        if (!relativePath) {
          continue
        }
        await handleFileForTarget(event, target, relativePath)
      }
    }

    const watcher = createWatcher(false)
    const readyTask = new Promise<void>((resolve) => {
      watcher.once('ready', () => resolve())
      watcher.once('error', () => resolve())
    })

    watcher.on('add', path => void handleFile('add', path))
    watcher.on('change', path => void handleFile('change', path))
    watcher.on('unlink', path => void handleFile('unlink', path))
    watcher.on('error', (error) => {
      if (isWatchResourceLimitError(error)) {
        console.warn(`[vona:layer] watcher fallback to polling on layer "${def.id}"`)
        void watcher.close()
        const pollingWatcher = createWatcher(true)
        pollingWatcher.on('add', path => void handleFile('add', path))
        pollingWatcher.on('change', path => void handleFile('change', path))
        pollingWatcher.on('unlink', path => void handleFile('unlink', path))
        pollingWatcher.on('error', (pollingError) => {
          console.error(`[vona:layer] watcher error on layer "${def.id}":`, pollingError)
        })
        watchers.push(pollingWatcher)
        return
      }
      console.error(`[vona:layer] watcher error on layer "${def.id}":`, error)
    })

    watchers.push(watcher)
    await readyTask
  }

  const stop = (): void => {
    for (const watcher of watchers) {
      void watcher.close()
    }
    watchers.length = 0
    assetsByFile.clear()
  }

  const getAssets = (): LayerAsset[] => [...assetsByFile.values()].flat()

  const onMutation = (callback: (mutations: LayerMutation[]) => void): void => {
    callbacks.push(callback)
  }

  return {
    def,
    type: 'dynamic',
    getAssets,
    start,
    stop,
    onMutation,
  }
}

export function createLayer(options: LayerOptions): Layer {
  const { def } = options
  const isDynamic = def.source.type === 'local' && def.source.dynamic === true

  if (isDynamic) {
    return createDynamicLayer(options)
  }

  return createStaticLayer(options)
}
