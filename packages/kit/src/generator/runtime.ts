import type {
  ArtifactsLogger,
  ArtifactsRegistrySnapshot,
  ArtifactsReportPayload,
  ArtifactsRunStats,
  ArtifactsRuntime,
  ArtifactsRuntimeOptions,
  ArtifactsRuntimeRunOptions,
  ArtifactsRuntimeRunResult,
  ArtifactsStateSnapshot,
  DiffResult,
  ExplainResult,
  GenArtifact,
  HostId,
  HostKind,
  HostSpec,
  PlanResult,
  RegistryHostRecord,
  RenderCtx,
} from './types'
import { readdir, readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import micromatch from 'micromatch'
import { extname, join, normalize, relative } from 'pathe'
import { renderSlotsHost } from './host'
import { normalizeArtifacts } from './normalize'
import {
  loadArtifactsState,
  persistDisk,
  persistMemory,
  writeArtifactsReport,
} from './writer'

interface RuntimeEvent {
  source: string
  kind: 'init' | 'update' | 'manual'
  changedKeys?: string[]
  payload?: Record<string, unknown>
}

interface HostMaterialized {
  hostId: HostId
  path: string
  kind: HostKind
  mode: HostSpec['mode']
  artifacts: GenArtifact[]
  explain: ExplainResult
  renderMs: number
}

interface PlanComputation {
  plan: PlanResult
  diff: DiffResult
  writes: ReturnType<typeof normalizeArtifacts>
  skippedPaths: string[]
  removes: string[]
  normalized: ReturnType<typeof normalizeArtifacts>
  artifactByPath: Map<string, HostId>
}

const EMPTY_LOGGER: ArtifactsLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

function normalizePath(input: string): string {
  const normalized = normalize(input).replace(/\\/g, '/').replace(/^\.\//, '')
  return normalized.replace(/^\/+/, '')
}

function createEvent(input?: RuntimeEvent): RuntimeEvent {
  if (input) {
    return input
  }
  return {
    source: 'manual',
    kind: 'manual',
    changedKeys: [],
  }
}

function flattenHostArtifacts(hostOutputById: Map<string, HostMaterialized>): GenArtifact[] {
  const byPath = new Map<string, GenArtifact>()
  for (const output of hostOutputById.values()) {
    for (const artifact of output.artifacts) {
      const existing = byPath.get(artifact.path)
      if (existing && existing.owner !== artifact.owner) {
        throw new Error(`[vona:generate] host output path conflict on "${artifact.path}"`)
      }
      byPath.set(artifact.path, artifact)
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function createRenderCtx(host: HostSpec): RenderCtx {
  return {
    hostId: host.hostId,
    hostPath: host.path,
    kind: host.kind,
    format: {
      enabled: false,
      tool: 'none',
    },
    observe: {},
    env: {},
    utils: {
      normalizeEol(content: string, eol: 'lf' | 'crlf') {
        const normalized = content.replace(/\r\n?/g, '\n')
        if (eol === 'crlf') {
          return normalized.replace(/\n/g, '\r\n')
        }
        return normalized
      },
      indent(content: string, spaces: number) {
        const indent = ' '.repeat(Math.max(0, spaces))
        return content
          .split(/\r?\n/g)
          .map(line => (line ? `${indent}${line}` : line))
          .join('\n')
      },
    },
  }
}

function normalizeText(content: string, eol: 'lf' | 'crlf' = 'lf'): string {
  const normalized = content.replace(/\r\n?/g, '\n')
  const withNewline = normalized.endsWith('\n') ? normalized : `${normalized}\n`
  if (eol === 'crlf') {
    return withNewline.replace(/\n/g, '\r\n')
  }
  return withNewline
}

function matchesCopyDir(path: string, host: Extract<HostSpec, { mode: 'copyDir' }>): boolean {
  if (host.filter) {
    const include = Array.isArray(host.filter) ? host.filter : [host.filter]
    if (!micromatch.isMatch(path, include)) {
      return false
    }
  }

  if (host.ignore) {
    const exclude = Array.isArray(host.ignore) ? host.ignore : [host.ignore]
    if (micromatch.isMatch(path, exclude)) {
      return false
    }
  }

  return true
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const files: string[] = []

  const walk = async (currentDir: string): Promise<void> => {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      files.push(normalizePath(relative(rootDir, abs)))
    }
  }

  await walk(rootDir)
  files.sort((a, b) => a.localeCompare(b))
  return files
}

function toHostArtifactId(hostId: string, key?: string): string {
  if (!key) {
    return `host:${hostId}`
  }
  return `host:${hostId}:${key}`
}

async function materializeHost(record: RegistryHostRecord): Promise<HostMaterialized> {
  const start = performance.now()
  const host = record.spec

  if (host.mode === 'text') {
    const raw = typeof host.content === 'function'
      ? await host.content()
      : host.content
    const content = normalizeText(raw, host.eol)

    return {
      hostId: host.hostId,
      path: host.path,
      kind: host.kind,
      mode: host.mode,
      artifacts: [{
        id: toHostArtifactId(host.hostId),
        hostId: host.hostId,
        path: normalizePath(host.path),
        ext: extname(host.path) || '.txt',
        content,
        source: 'host.text',
        owner: record.owners[0],
      }],
      explain: {
        hostId: host.hostId,
        path: host.path,
        mode: host.mode,
        watches: (host.watch ?? []).map(w => ({ id: w.id })),
      },
      renderMs: performance.now() - start,
    }
  }

  if (host.mode === 'copyFile') {
    const input = await readFile(host.from)
    const bytes = host.transform
      ? await host.transform(input, createRenderCtx(host))
      : input

    return {
      hostId: host.hostId,
      path: host.path,
      kind: host.kind,
      mode: host.mode,
      artifacts: [{
        id: toHostArtifactId(host.hostId),
        hostId: host.hostId,
        path: normalizePath(host.path),
        ext: extname(host.path) || '.bin',
        bytes,
        source: 'host.copyFile',
        owner: record.owners[0],
      }],
      explain: {
        hostId: host.hostId,
        path: host.path,
        mode: host.mode,
        watches: (host.watch ?? []).map(w => ({ id: w.id })),
      },
      renderMs: performance.now() - start,
    }
  }

  if (host.mode === 'copyDir') {
    const relativeFiles = await listFilesRecursive(host.from)
    const artifacts: GenArtifact[] = []

    for (const relFile of relativeFiles) {
      if (!matchesCopyDir(relFile, host)) {
        continue
      }
      const sourcePath = join(host.from, relFile)
      const mappedPath = host.mapPath ? host.mapPath(relFile) : relFile
      const targetPath = normalizePath(join(host.path, mappedPath))
      const bytes = await readFile(sourcePath)
      artifacts.push({
        id: toHostArtifactId(host.hostId, relFile),
        hostId: host.hostId,
        path: targetPath,
        ext: extname(targetPath) || '.bin',
        bytes,
        source: 'host.copyDir',
        owner: record.owners[0],
      })
    }

    artifacts.sort((a, b) => a.path.localeCompare(b.path))

    return {
      hostId: host.hostId,
      path: host.path,
      kind: host.kind,
      mode: host.mode,
      artifacts,
      explain: {
        hostId: host.hostId,
        path: host.path,
        mode: host.mode,
        watches: (host.watch ?? []).map(w => ({ id: w.id })),
      },
      renderMs: performance.now() - start,
    }
  }

  const rendered = await renderSlotsHost(record)
  return {
    hostId: host.hostId,
    path: host.path,
    kind: host.kind,
    mode: host.mode,
    artifacts: [{
      id: toHostArtifactId(host.hostId),
      hostId: host.hostId,
      path: normalizePath(host.path),
      ext: extname(host.path) || '.txt',
      content: rendered.content,
      source: 'host.slots',
      owner: record.owners[0],
    }],
    explain: {
      hostId: host.hostId,
      path: host.path,
      mode: host.mode,
      watches: (host.watch ?? []).map(w => ({ id: w.id })),
      slots: rendered.slots,
    },
    renderMs: performance.now() - start,
  }
}

function computePlan(
  state: ArtifactsStateSnapshot,
  clean: boolean,
  hostOutputById: Map<string, HostMaterialized>,
): PlanComputation {
  const allArtifacts = flattenHostArtifacts(hostOutputById)
  const normalized = normalizeArtifacts(allArtifacts)

  const writes = normalized.filter((artifact) => {
    const previous = state.managed[artifact.path]
    if (!previous) {
      return true
    }
    return previous.hash !== artifact.hash || previous.size !== artifact.size
  })

  const normalizedPathSet = new Set(normalized.map(item => item.path))
  const removes = clean
    ? Object.keys(state.managed).filter(path => !normalizedPathSet.has(path))
    : []

  const writtenSet = new Set(writes.map(item => item.path))
  const skippedPaths = normalized
    .filter(item => !writtenSet.has(item.path))
    .map(item => item.path)

  const artifactByPath = new Map<string, HostId>()
  for (const artifact of normalized) {
    artifactByPath.set(artifact.path, artifact.hostId)
  }

  const plan: PlanResult = {
    hosts: normalized
      .map(item => ({
        hostId: item.hostId,
        path: item.path,
        kind: hostOutputById.get(item.hostId)?.kind ?? 'unknown',
        planHash: item.hash,
        changed: writtenSet.has(item.path),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }

  const diffFiles: DiffResult['files'] = []
  for (const item of normalized) {
    const previous = state.managed[item.path]
    if (!previous) {
      diffFiles.push({
        path: item.path,
        hostId: item.hostId,
        changed: true,
        summary: 'added',
      })
      continue
    }

    if (previous.hash !== item.hash || previous.size !== item.size) {
      diffFiles.push({
        path: item.path,
        hostId: item.hostId,
        changed: true,
        summary: 'updated',
      })
      continue
    }

    diffFiles.push({
      path: item.path,
      hostId: item.hostId,
      changed: false,
      summary: 'unchanged',
    })
  }

  for (const removed of removes) {
    diffFiles.push({
      path: removed,
      changed: true,
      summary: 'removed',
    })
  }

  return {
    plan,
    diff: {
      files: diffFiles.sort((a, b) => a.path.localeCompare(b.path)),
    },
    writes,
    skippedPaths,
    removes,
    normalized,
    artifactByPath,
  }
}

export function createArtifactsRuntime(options: ArtifactsRuntimeOptions): ArtifactsRuntime {
  const logger: ArtifactsLogger = {
    ...EMPTY_LOGGER,
    ...options.logger,
  }

  const mode = options.mode ?? 'disk'
  const clean = options.clean ?? false
  const cacheFile = options.cacheFile ?? '.cache/generate-state.json'
  const debounceMs = options.debounceMs ?? 80
  const writeConcurrency = options.writeConcurrency ?? 8
  const reportEnabled = options.report?.enabled !== false
  const reportFile = options.report?.file ?? '.cache/generate-report.json'

  let loaded = false
  let state: ArtifactsStateSnapshot = { version: 1, managed: {} }
  let snapshot: ArtifactsRegistrySnapshot | undefined

  const hostOutputById = new Map<string, HostMaterialized>()
  const memoryArtifactMap = new Map<string, GenArtifact>()

  const dirtyHostIds = new Set<string>()
  const dirtyReasonsByHost = new Map<string, Set<string>>()
  const watchDisposers = new Map<string, Array<() => void>>()
  const downstreamByHost = new Map<string, Set<string>>()

  let processing: Promise<void> = Promise.resolve()
  let flushTimer: NodeJS.Timeout | undefined
  let starting = false
  let started = false
  let closing = false

  const ensureStateLoaded = async (): Promise<void> => {
    if (loaded) {
      return
    }
    if (mode === 'disk') {
      state = await loadArtifactsState(join(options.outputDir, cacheFile))
    }
    loaded = true
  }

  const ensureSnapshot = (): ArtifactsRegistrySnapshot => {
    if (!snapshot) {
      snapshot = options.registry()
    }
    return snapshot
  }

  const refreshSnapshot = (): ArtifactsRegistrySnapshot => {
    snapshot = options.registry()
    downstreamByHost.clear()
    for (const edge of snapshot.graph.edges) {
      const set = downstreamByHost.get(edge.fromHostId) ?? new Set<string>()
      set.add(edge.toHostId)
      downstreamByHost.set(edge.fromHostId, set)
    }
    return snapshot
  }

  const getHostRecordById = (hostId: string): RegistryHostRecord | undefined => {
    return ensureSnapshot().hosts.find(item => item.spec.hostId === hostId)
  }

  const getHostRecordByPath = (path: string): RegistryHostRecord | undefined => {
    const normalized = normalizePath(path)
    return ensureSnapshot().hosts.find(item => item.spec.path === normalized)
  }

  const renderHost = async (record: RegistryHostRecord): Promise<void> => {
    const output = await materializeHost(record)
    hostOutputById.set(record.spec.hostId, output)
  }

  const renderAllHosts = async (): Promise<number> => {
    const current = refreshSnapshot()

    const activeHostIds = new Set(current.hosts.map(item => item.spec.hostId))
    for (const hostId of [...hostOutputById.keys()]) {
      if (!activeHostIds.has(hostId)) {
        hostOutputById.delete(hostId)
      }
    }

    let renderMs = 0
    for (const host of current.hosts) {
      await renderHost(host)
      renderMs += hostOutputById.get(host.spec.hostId)?.renderMs ?? 0
    }
    return renderMs
  }

  const renderDirtyHosts = async (hostIds: string[]): Promise<number> => {
    refreshSnapshot()
    let renderMs = 0
    for (const hostId of hostIds) {
      const host = getHostRecordById(hostId)
      if (!host) {
        hostOutputById.delete(hostId)
        continue
      }
      await renderHost(host)
      renderMs += hostOutputById.get(host.spec.hostId)?.renderMs ?? 0
    }
    return renderMs
  }

  const persistAll = async (event: RuntimeEvent, renderMs: number): Promise<ArtifactsRuntimeRunResult> => {
    const totalStart = performance.now()

    const normalizeStart = performance.now()
    const planned = computePlan(state, clean, hostOutputById)
    const normalizeMs = performance.now() - normalizeStart

    const persistStart = performance.now()
    if (mode === 'disk') {
      const persisted = await persistDisk({
        outputDir: options.outputDir,
        stateFile: cacheFile,
        writeConcurrency,
        clean,
        writes: planned.writes,
        removes: planned.removes,
        allArtifacts: planned.normalized,
        previousState: state,
      })
      state = persisted.state
    }
    else {
      const persisted = await persistMemory({ allArtifacts: planned.normalized })
      state = persisted.state
      memoryArtifactMap.clear()
      for (const artifact of persisted.entries) {
        memoryArtifactMap.set(artifact.path, artifact)
      }
    }
    const persistMs = performance.now() - persistStart

    const stats: ArtifactsRunStats = {
      collectMs: 0,
      renderMs,
      normalizeMs,
      persistMs,
      totalMs: performance.now() - totalStart,
    }

    const result: ArtifactsRuntimeRunResult = {
      event,
      mode,
      hostCount: ensureSnapshot().hosts.length,
      artifactCount: planned.normalized.length,
      writeCount: planned.writes.length,
      skipCount: planned.skippedPaths.length,
      removeCount: planned.removes.length,
      writtenPaths: planned.writes.map(item => item.path),
      skippedPaths: planned.skippedPaths,
      removedPaths: planned.removes,
      stats,
    }

    if (reportEnabled) {
      const payload: ArtifactsReportPayload = {
        hosts: [...hostOutputById.values()]
          .map(item => ({
            id: item.hostId,
            mode: item.mode,
            path: item.path,
            slotCount: item.explain.slots?.length ?? 0,
            watchCount: item.explain.watches?.length ?? 0,
            renderMs: item.renderMs,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        outputs: {
          written: result.writtenPaths,
          skipped: result.skippedPaths,
          removed: result.removedPaths,
        },
        stats: {
          hosts: result.hostCount,
          artifacts: result.artifactCount,
          writes: result.writeCount,
          skips: result.skipCount,
          removes: result.removeCount,
          timings: stats,
        },
      }
      result.reportPath = await writeArtifactsReport(options.outputDir, reportFile, payload)
    }

    logger.debug(
      `run source=${event.source}:${event.kind}`
      + ` hosts=${result.hostCount} artifacts=${result.artifactCount}`
      + ` write=${result.writeCount} skip=${result.skipCount} remove=${result.removeCount}`
      + ` total=${result.stats.totalMs.toFixed(2)}ms`,
    )

    return result
  }

  const runFull = async (event: RuntimeEvent): Promise<ArtifactsRuntimeRunResult> => {
    await ensureStateLoaded()
    const renderMs = await renderAllHosts()
    return persistAll(event, renderMs)
  }

  const runDirty = async (event: RuntimeEvent, hostIds: string[]): Promise<ArtifactsRuntimeRunResult | undefined> => {
    if (hostIds.length === 0) {
      return undefined
    }
    await ensureStateLoaded()
    const renderMs = await renderDirtyHosts(hostIds)
    return persistAll(event, renderMs)
  }

  const enqueue = async <T>(job: () => Promise<T>): Promise<T> => {
    const task = processing.then(job, job)
    processing = task.then(() => {}, () => {})
    return task
  }

  const markDirty = (hostId: string, reason?: string): void => {
    const queue: string[] = [hostId]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) {
        continue
      }
      visited.add(current)
      dirtyHostIds.add(current)
      const next = downstreamByHost.get(current)
      if (next) {
        for (const target of next) {
          queue.push(target)
        }
      }
    }

    if (reason && reason.trim()) {
      for (const id of visited) {
        const reasons = dirtyReasonsByHost.get(id) ?? new Set<string>()
        reasons.add(reason)
        dirtyReasonsByHost.set(id, reasons)
      }
    }

    if (starting) {
      return
    }

    if (flushTimer) {
      clearTimeout(flushTimer)
    }

    flushTimer = setTimeout(() => {
      flushTimer = undefined
      const dirty = [...dirtyHostIds]
      dirtyHostIds.clear()

      void enqueue(async () => {
        const changedKeys = dirty.flatMap(id => [...(dirtyReasonsByHost.get(id) ?? new Set<string>())])
        for (const id of dirty) {
          dirtyReasonsByHost.delete(id)
        }

        const result = await runDirty({
          source: 'watch',
          kind: 'update',
          changedKeys,
        }, dirty)

        if (result) {
          logger.debug(`dirty flush hosts=${dirty.length} write=${result.writeCount} skip=${result.skipCount}`)
        }
      })
    }, Math.max(0, debounceMs))
  }

  const installWatchers = async (): Promise<void> => {
    const current = refreshSnapshot()

    for (const host of current.hosts) {
      const deps = host.spec.watch ?? []
      if (deps.length === 0) {
        continue
      }

      const disposers: Array<() => void> = []
      for (const dep of deps) {
        try {
          const result = dep.subscribe({
            emit(key: string) {
              markDirty(host.spec.hostId, key)
            },
          })

          if (typeof result === 'function') {
            disposers.push(result)
          }
          else {
            disposers.push(() => result.dispose())
          }
        }
        catch (error) {
          logger.error(error)
        }
      }

      if (disposers.length > 0) {
        watchDisposers.set(host.spec.hostId, disposers)
      }
    }
  }

  const plan: ArtifactsRuntime['plan'] = async () => {
    await ensureStateLoaded()
    await renderAllHosts()
    return computePlan(state, clean, hostOutputById).plan
  }

  const commit: ArtifactsRuntime['commit'] = async () => {
    await ensureStateLoaded()
    await renderAllHosts()
    const planned = computePlan(state, clean, hostOutputById)

    if (mode === 'disk') {
      const persisted = await persistDisk({
        outputDir: options.outputDir,
        stateFile: cacheFile,
        writeConcurrency,
        clean,
        writes: planned.writes,
        removes: planned.removes,
        allArtifacts: planned.normalized,
        previousState: state,
      })
      state = persisted.state
    }
    else {
      const persisted = await persistMemory({ allArtifacts: planned.normalized })
      state = persisted.state
      memoryArtifactMap.clear()
      for (const artifact of persisted.entries) {
        memoryArtifactMap.set(artifact.path, artifact)
      }
    }

    return {
      emitted: planned.writes.map(item => ({
        hostId: item.hostId,
        path: item.path,
        bytes: item.size,
      })),
      skipped: planned.skippedPaths.map(path => ({
        hostId: planned.artifactByPath.get(path) ?? 'unknown',
        path,
        reason: 'unchanged',
      })),
      removed: planned.removes.map(path => ({ path })),
    }
  }

  const diff: ArtifactsRuntime['diff'] = async () => {
    await ensureStateLoaded()
    await renderAllHosts()
    return computePlan(state, clean, hostOutputById).diff
  }

  const explain: ArtifactsRuntime['explain'] = async (hostIdOrPath: string) => {
    await ensureStateLoaded()
    if (hostOutputById.size === 0) {
      await renderAllHosts()
    }

    const byId = getHostRecordById(hostIdOrPath)
    const byPath = byId ? undefined : getHostRecordByPath(hostIdOrPath)
    const target = byId ?? byPath

    if (!target) {
      throw new Error(`[vona:generate] host "${hostIdOrPath}" not found`)
    }

    const output = hostOutputById.get(target.spec.hostId)
    if (!output) {
      throw new Error(`[vona:generate] host "${hostIdOrPath}" has no rendered output`)
    }

    return output.explain
  }

  const start: ArtifactsRuntime['start'] = async () => {
    if (started || starting) {
      return
    }
    starting = true
    try {
      await ensureStateLoaded()
      await installWatchers()
      await enqueue(async () => {
        await runFull({
          source: 'runtime',
          kind: 'init',
        })
      })
      started = true
    }
    finally {
      starting = false
    }
  }

  const run: ArtifactsRuntime['run'] = async (runOptions: ArtifactsRuntimeRunOptions = {}) => {
    const event = createEvent(runOptions.event as RuntimeEvent | undefined)
    return enqueue(async () => runFull(event))
  }

  const close: ArtifactsRuntime['close'] = async () => {
    if (closing) {
      return
    }
    closing = true

    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }

    await processing

    for (const [hostId, disposers] of watchDisposers) {
      for (const dispose of disposers) {
        try {
          dispose()
        }
        catch (error) {
          logger.warn(`[vona:generate] failed to dispose watch for host "${hostId}"`)
          logger.error(error)
        }
      }
    }

    watchDisposers.clear()
    dirtyHostIds.clear()
    dirtyReasonsByHost.clear()
    started = false
  }

  return {
    start,
    run,
    plan,
    commit,
    diff,
    explain,
    memoryEntries() {
      return [...memoryArtifactMap.values()]
    },
    close,
  }
}
