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

type WatchEvent = 'add' | 'change' | 'unlink'

interface WatchTarget {
  type: ResourceType
  scanConfig: ResourceScanConfig
  rootName: string
  rootAbs: string
  isMatch: (path: string) => boolean
}

interface PendingTargetTask {
  event: WatchEvent
  target: WatchTarget
  relativePath: string
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
    const rootAbs = join(def.source.root, rootName)
    if (!existsSync(rootAbs)) {
      continue
    }
    const matchers = scanConfig.pattern.map(pattern => micromatch.matcher(pattern, {
      ignore: scanConfig.ignore ?? [],
    }))

    targets.push({
      type: type as ResourceType,
      scanConfig,
      rootName,
      rootAbs,
      isMatch: path => matchers.some(match => match(path)),
    })
  }
  return targets
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
  const pendingByKey = new Map<string, PendingTargetTask>()

  let disposed = false
  let flushScheduled = false
  let processing = Promise.resolve()

  const emitMutation = (mutations: LayerMutation[]): void => {
    if (mutations.length === 0) {
      return
    }
    callbacks.forEach(cb => cb(mutations))
  }

  const handleFileForTarget = async (
    event: WatchEvent,
    target: WatchTarget,
    relativePath: string,
  ): Promise<void> => {
    if (disposed) {
      return
    }

    const rawPath = normalizeSlashes(join(target.rootName, relativePath))
    const previousAssets = assetsByFile.get(rawPath) ?? []
    const nextAssets = event === 'unlink'
      ? []
      : scanSingleFile(relativePath, def, target.type, target.scanConfig.name)
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

  const scheduleFlush = (): void => {
    if (flushScheduled) {
      return
    }
    flushScheduled = true

    queueMicrotask(() => {
      flushScheduled = false
      const tasks = [...pendingByKey.values()]
      pendingByKey.clear()
      if (tasks.length === 0) {
        return
      }

      processing = processing
        .then(async () => {
          for (const task of tasks) {
            if (disposed) {
              return
            }
            await handleFileForTarget(task.event, task.target, task.relativePath)
          }
        })
        .catch((error) => {
          console.error(`[vona:layer] watcher queue error on layer "${def.id}":`, error)
        })
    })
  }

  const enqueueFileTask = (event: WatchEvent, target: WatchTarget, filePath: string): void => {
    if (disposed) {
      return
    }

    const relativePath = normalizeSlashes(relative(target.rootAbs, filePath))
    if (!relativePath || relativePath.startsWith('../')) {
      return
    }
    if (!target.isMatch(relativePath)) {
      return
    }

    const key = `${target.type}:${relativePath}`
    pendingByKey.set(key, {
      event,
      target,
      relativePath,
    })
    scheduleFlush()
  }

  const start = async (): Promise<void> => {
    if (def.source.type !== 'local') {
      return
    }

    disposed = false
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

    const createWatcher = (target: WatchTarget, usePolling: boolean): ReturnType<typeof chokidar.watch> => {
      return chokidar.watch(target.rootAbs, {
        ignored: buildLayerIgnore(def),
        persistent: true,
        ignoreInitial: true,
        usePolling,
        interval: 120,
        binaryInterval: 300,
      })
    }

    const mountWatcher = (target: WatchTarget, usePolling: boolean, index?: number): Promise<void> => {
      const watcher = createWatcher(target, usePolling)
      const watcherIndex = typeof index === 'number' ? index : watchers.length
      watchers[watcherIndex] = watcher

      watcher.on('add', path => enqueueFileTask('add', target, path))
      watcher.on('change', path => enqueueFileTask('change', target, path))
      watcher.on('unlink', path => enqueueFileTask('unlink', target, path))
      watcher.on('error', (error) => {
        if (isWatchResourceLimitError(error) && !usePolling) {
          console.warn(`[vona:layer] watcher fallback to polling on layer "${def.id}"`)
          void watcher.close()
          void mountWatcher(target, true, watcherIndex)
          return
        }
        console.error(`[vona:layer] watcher error on layer "${def.id}":`, error)
      })

      return new Promise<void>((resolve) => {
        watcher.once('ready', () => resolve())
        watcher.once('error', () => resolve())
      })
    }

    await Promise.all(targets.map(target => mountWatcher(target, false)))
  }

  const stop = (): void => {
    disposed = true
    pendingByKey.clear()
    processing = Promise.resolve()

    for (const watcher of watchers) {
      if (watcher) {
        void watcher.close()
      }
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
