import type { LayerAsset, LayerDef, ResourceScanConfig, ResourceType } from '@vona-js/schema'
import type { OVFS } from '../ovfs/ovfs'
import { existsSync } from 'node:fs'
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
  onChange: (callback: (assets: LayerAsset[], changes: LayerChange[]) => void) => void
}

export interface LayerChange {
  type: 'add' | 'change' | 'unlink'
  key: string
  routePath?: string
  asset?: LayerAsset
}

export interface LayerOptions {
  def: LayerDef
  config: Record<string, ResourceScanConfig>
  ovfs?: OVFS
}

interface WatchTarget {
  type: ResourceType
  scanConfig: ResourceScanConfig
  root: string
}

function isWatchResourceLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: string }).code
  return code === 'EMFILE' || code === 'ENOSPC'
}

function buildIgnore(def: LayerDef, scanConfig: ResourceScanConfig): string[] {
  return [
    '**/_*',
    '**/_*/**',
    '**/.*',
    '**/.*/**',
    'node_modules',
    ...(def.ignore ?? []),
    ...(scanConfig.ignore ?? []),
  ]
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
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
    const root = join(def.source.root, scanConfig.name)
    if (!existsSync(root)) {
      continue
    }
    targets.push({
      type: type as ResourceType,
      scanConfig,
      root,
    })
  }
  return targets
}

function getRoutePath(asset?: LayerAsset): string | undefined {
  return asset?.meta.routePath ?? asset?.route?.path
}

function emitAssetDiff(
  previousWinners: LayerAsset[],
  nextWinners: LayerAsset[],
): LayerChange[] {
  const previousMap = new Map(previousWinners.map(asset => [asset.key, asset]))
  const nextMap = new Map(nextWinners.map(asset => [asset.key, asset]))
  const keys = new Set([...previousMap.keys(), ...nextMap.keys()])

  const changes: LayerChange[] = []
  for (const key of keys) {
    const before = previousMap.get(key)
    const after = nextMap.get(key)

    if (!before && after) {
      changes.push({
        type: 'add',
        key,
        routePath: getRoutePath(after),
        asset: after,
      })
      continue
    }

    if (before && !after) {
      changes.push({
        type: 'unlink',
        key,
        routePath: getRoutePath(before),
      })
      continue
    }

    if (before && after && before.id !== after.id) {
      changes.push({
        type: 'change',
        key,
        routePath: getRoutePath(after),
        asset: after,
      })
    }
  }
  return changes
}

function emitContentChange(previousWinners: LayerAsset[], nextWinners: LayerAsset[]): LayerChange[] {
  const previousMap = new Map(previousWinners.map(asset => [asset.key, asset]))
  const changes: LayerChange[] = []
  for (const asset of nextWinners) {
    const before = previousMap.get(asset.key)
    if (before && before.id === asset.id) {
      changes.push({
        type: 'change',
        key: asset.key,
        routePath: getRoutePath(asset),
        asset,
      })
    }
  }
  return changes
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

  const onChange = (_callback: (assets: LayerAsset[], changes: LayerChange[]) => void): void => {
    // 静态层不支持变更
  }

  return {
    def,
    type: 'static',
    getAssets,
    start,
    stop,
    onChange,
  }
}

export function createDynamicLayer(options: LayerOptions): Layer {
  const { def, config, ovfs } = options
  const watchers: Array<ReturnType<typeof chokidar.watch>> = []
  const assetsByFile = new Map<string, LayerAsset[]>()
  const callbacks: Array<(assets: LayerAsset[], changes: LayerChange[]) => void> = []

  const emitChange = (assetList: LayerAsset[], changes: LayerChange[]) => {
    if (changes.length === 0) {
      return
    }
    callbacks.forEach(cb => cb(assetList, changes))
  }

  const start = async () => {
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
    const readyTasks: Array<Promise<void>> = []
    for (const target of targets) {
      const createWatcher = (usePolling: boolean) => {
        return chokidar.watch(target.root, {
          ignored: buildIgnore(def, target.scanConfig),
          persistent: true,
          ignoreInitial: true,
          usePolling,
          interval: 120,
          binaryInterval: 300,
        })
      }

      const watcher = createWatcher(false)
      readyTasks.push(new Promise((resolve) => {
        watcher.once('ready', () => resolve())
        watcher.once('error', () => resolve())
      }))

      const handleFile = async (event: 'add' | 'change' | 'unlink', filePath: string) => {
        const relativePath = normalizeSlashes(relative(target.root, filePath))
        if (relativePath.startsWith('../')) {
          return
        }
        if (!micromatch.isMatch(relativePath, target.scanConfig.pattern)) {
          return
        }

        const rawPath = normalizeSlashes(join(target.scanConfig.name, relativePath))
        const previousAssets = assetsByFile.get(rawPath) ?? []
        const relatedKeys = new Set(previousAssets.map(asset => asset.key))

        if (event !== 'unlink') {
          const nextAssets = await scanSingleFile(relativePath, def, target.type, target.scanConfig.name)
          for (const asset of nextAssets) {
            relatedKeys.add(asset.key)
          }
        }

        const previousWinners = [...relatedKeys].map(key => ovfs?.resolve(key)).filter(Boolean) as LayerAsset[]

        for (const oldAsset of previousAssets) {
          ovfs?.removeById(oldAsset.id)
        }
        assetsByFile.delete(rawPath)

        if (event !== 'unlink') {
          const nextAssets = await scanSingleFile(relativePath, def, target.type, target.scanConfig.name)
          for (const asset of nextAssets) {
            ovfs?.upsert(asset)
          }
          if (nextAssets.length > 0) {
            assetsByFile.set(rawPath, nextAssets)
          }
        }

        const nextWinners = [...relatedKeys].map(key => ovfs?.resolve(key)).filter(Boolean) as LayerAsset[]
        const winnerDiff = emitAssetDiff(previousWinners, nextWinners)
        if (winnerDiff.length > 0) {
          emitChange(nextWinners, winnerDiff)
          return
        }

        if (event === 'change') {
          const contentDiff = emitContentChange(previousWinners, nextWinners)
          if (contentDiff.length > 0) {
            emitChange(nextWinners, contentDiff)
          }
        }
      }

      watcher.on('add', path => void handleFile('add', path))
      watcher.on('change', path => void handleFile('change', path))
      watcher.on('unlink', path => void handleFile('unlink', path))
      watcher.on('error', (error) => {
        if (isWatchResourceLimitError(error)) {
          console.warn(`[vona:layer] watcher fallback to polling on layer "${def.id}" (${target.type})`)
          void watcher.close()
          const pollingWatcher = createWatcher(true)
          pollingWatcher.on('add', path => void handleFile('add', path))
          pollingWatcher.on('change', path => void handleFile('change', path))
          pollingWatcher.on('unlink', path => void handleFile('unlink', path))
          pollingWatcher.on('error', (pollingError) => {
            console.error(`[vona:layer] watcher error on layer "${def.id}" (${target.type}):`, pollingError)
          })
          watchers.push(pollingWatcher)
          return
        }
        console.error(`[vona:layer] watcher error on layer "${def.id}" (${target.type}):`, error)
      })

      watchers.push(watcher)
    }

    await Promise.all(readyTasks)
  }

  const stop = () => {
    for (const watcher of watchers) {
      void watcher.close()
    }
    watchers.length = 0
    assetsByFile.clear()
  }

  const getAssets = () => [...assetsByFile.values()].flat()

  const onChange = (callback: (assets: LayerAsset[], changes: LayerChange[]) => void) => {
    callbacks.push(callback)
  }

  return {
    def,
    type: 'dynamic',
    getAssets,
    start,
    stop,
    onChange,
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
