import type { Vona } from '@vona-js/schema'

export type Awaitable<T> = T | Promise<T>

export type HostId = string
export type SlotName = string
export type IRChannel = string
export type ModuleId = string

export type Stage = 'pre' | 'normal' | 'post'

export type HostKind
  = | 'ts' | 'dts' | 'tsx'
    | 'js' | 'jsx'
    | 'vue'
    | 'json'
    | 'css'
    | 'text'
    | 'binary'
    | 'unknown'

export type HostMode = 'unset' | 'text' | 'copyFile' | 'copyDir' | 'slots'

export type ConflictPolicy = 'error' | 'overwrite' | 'skipIfExists'
export type CleanupPolicy = 'keep' | 'remove-orphans'
export type FormatTool = 'prettier' | 'biome' | 'none' | (string & {})

export type ArtifactsMode = 'disk' | 'memory'

export interface ObserveOptions {
  manifest?: boolean
  explain?: boolean
  diff?: boolean
  emitEvents?: boolean
  debugComments?: boolean
}

export interface ArtifactEvents {
  onPlanned?: (e: { hostId: HostId, path: string, planHash: string, changed: boolean }) => void
  onEmitted?: (e: { hostId: HostId, path: string, bytes: number }) => void
  onSkipped?: (e: { hostId: HostId, path: string, reason: 'unchanged' | 'policy' }) => void
  onRemoved?: (e: { path: string }) => void
  onConflict?: (e: { hostId: HostId, path: string, reason: string }) => void
  onError?: (e: { hostId?: HostId, path?: string, error: unknown }) => void
}

export interface InvalidationEmitter {
  emit: (key: string) => void
}

export interface DependencyDisposer {
  dispose: () => void
}

export interface HostWatchDependency {
  id: string
  subscribe: (emit: InvalidationEmitter) => DependencyDisposer | (() => void)
}

export interface SlotItem<T = unknown> {
  kind: string
  data: T
  from: {
    module: ModuleId
    version?: string
    trace?: string
  }
  stage?: Stage
  order?: number
  key?: string
  inputId?: string
  meta?: Record<string, unknown>
}

export interface InputCtx {
  hostId: HostId
  env: Record<string, unknown>
}

export interface SlotInput<TIn = unknown> {
  from: IRChannel
  where?: (item: TIn, ctx: InputCtx) => boolean
  map?: (item: TIn, ctx: InputCtx) => SlotItem | SlotItem[] | null

  kind?: string
  key?: (item: TIn, ctx: InputCtx) => string | undefined
  stage?: Stage
  order?: number

  sourceModule?: ModuleId
  inputId?: string
}

export interface RenderCtx {
  hostId: HostId
  hostPath: string
  kind: HostKind

  format: { enabled: boolean, tool: FormatTool, options?: Record<string, unknown> }
  observe: ObserveOptions
  env: Record<string, unknown>

  utils: {
    normalizeEol: (s: string, eol: 'lf' | 'crlf') => string
    indent: (s: string, spaces: number) => string
  }
}

export interface SlotSpec<T extends SlotItem = SlotItem> {
  accepts?: string[]
  inputs?: SlotInput[]

  map?: (item: T, ctx: RenderCtx) => T | null
  sort?: (a: T, b: T, ctx: RenderCtx) => number
  dedupe?: (items: T[], ctx: RenderCtx) => T[]

  render: (items: T[], ctx: RenderCtx) => string
}

export interface SlotItemFactory<TData = unknown> {
  kind: string
  make: (data: TData, opt?: Partial<Omit<SlotItem<TData>, 'kind' | 'data'>>) => SlotItem<TData>
}

export interface SlotPreset {
  name: string
  spec: SlotSpec
  factory?: SlotItemFactory
}

export interface SlotSpecPatch {
  accepts?: string[] | ((prev?: string[]) => string[])
  map?: SlotSpec['map']
  sort?: SlotSpec['sort']
  dedupe?: SlotSpec['dedupe']
  render?: SlotSpec['render']

  addInputs?: SlotInput[]
  replaceInputs?: SlotInput[]
}

export interface Contribution {
  target: { hostId: HostId, slot: SlotName }
  payload: SlotItem
  when?: Record<string, unknown>
}

export interface HostIRStore {
  push: <T = unknown>(channel: IRChannel, item: T) => void
  read: <T = unknown>(channel: IRChannel) => T[]
  channels: () => IRChannel[]
}

export interface HostSpecBase {
  hostId: HostId
  path: string
  kind: HostKind

  format?: boolean | { tool: FormatTool, options?: Record<string, unknown> }
  observe?: ObserveOptions

  tags?: string[]

  allowExternal?: boolean
  conflict?: ConflictPolicy

  watch?: HostWatchDependency[]
}

export interface HostSpecText extends HostSpecBase {
  mode: 'text'
  content: string | (() => string | Promise<string>)
  encoding?: 'utf8' | 'utf16le' | 'latin1'
  eol?: 'lf' | 'crlf'
  hashInputs?: Array<string | number | boolean>
}

export interface HostSpecCopyFile extends HostSpecBase {
  mode: 'copyFile'
  from: string
  transform?: (input: Uint8Array, ctx: RenderCtx) => Uint8Array | Promise<Uint8Array>
}

export interface HostSpecCopyDir extends HostSpecBase {
  mode: 'copyDir'
  from: string
  filter?: string | string[]
  ignore?: string | string[]
  mapPath?: (relPath: string) => string
}

export interface HostSpecSlots extends HostSpecBase {
  mode: 'slots'
  template: string | (() => string | Promise<string>)
  slots: Record<SlotName, SlotSpec>
  directContributions?: Contribution[]
  marker?: {
    mode?: 'auto' | 'ts-comment' | 'html-comment'
    onMissingMarker?: 'error' | 'ignore'
  }
}

export type HostSpec = HostSpecText | HostSpecCopyFile | HostSpecCopyDir | HostSpecSlots

export interface ArtifactsPolicy {
  managedRoot: string
  allowOutsideRoot?: boolean
  cleanup?: CleanupPolicy
  conflict?: ConflictPolicy
  concurrency?: number
  dryRun?: boolean
}

export interface PlanResult {
  hosts: Array<{
    hostId: HostId
    path: string
    kind: HostKind
    planHash: string
    changed: boolean
  }>
}

export interface CommitResult {
  emitted: Array<{ hostId: HostId, path: string, bytes: number }>
  skipped: Array<{ hostId: HostId, path: string, reason: string }>
  removed?: Array<{ path: string }>
}

export interface ExplainResult {
  hostId: HostId
  path: string
  mode: HostSpec['mode']

  watches?: Array<{ id: string }>

  slots?: Array<{
    slot: SlotName
    preset?: string
    accepts?: string[]
    items: Array<{
      kind: string
      key?: string
      from: SlotItem['from']
      stage?: Stage
      order?: number
      inputId?: string
    }>
  }>
}

export interface DiffResult {
  files: Array<{
    path: string
    hostId?: HostId
    changed: boolean
    summary?: string
  }>
}

export type FilePathScope = readonly string[] | undefined
export type ScopedFilePath<TScope extends FilePathScope> = TScope extends readonly (infer Path extends string)[] ? Path : string

export interface ArtifactsBuilderOptions<TScope extends FilePathScope = undefined> {
  owner: string
  filePathScope?: TScope
  vona?: Vona
}

export interface ArtifactsBuilder<TFilePath extends string = string> {
  root: (path: string) => this
  format: (toolOrEnabled?: FormatTool | boolean, options?: Record<string, unknown>) => this
  observe: (opt: ObserveOptions, events?: ArtifactEvents) => this
  policy: (policy: Partial<ArtifactsPolicy>) => this

  host: (filePath: TFilePath) => HostBuilder<'unset', TFilePath>
  dir: (path: string) => DirBuilder<TFilePath>

  plan: () => Promise<PlanResult>
  commit: () => Promise<CommitResult>

  explain: (hostIdOrPath: string) => Promise<ExplainResult>
  diff: () => Promise<DiffResult>
}

export interface HostBuilder<Mode extends HostMode, TFilePath extends string = string> {
  at: (path: TFilePath) => this
  kind: (kind: HostKind) => this

  ts: () => this
  dts: () => this
  vue: () => this

  format: (enabledOrTool?: boolean | FormatTool, options?: Record<string, unknown>) => this
  observe: (opt: ObserveOptions) => this
  tags: (...tags: string[]) => this
  allowExternal: () => this
  conflict: (policy: ConflictPolicy) => this

  watch: (dep: HostWatchDependency) => this
  watchBy: (id: string, subscribe: (emit: InvalidationEmitter) => DependencyDisposer | (() => void)) => this

  text: Mode extends 'unset' ? () => TextHostBuilder<'text', TFilePath> : never
  copyFile: Mode extends 'unset' ? () => CopyFileHostBuilder<'copyFile', TFilePath> : never
  copyDir: Mode extends 'unset' ? () => CopyDirHostBuilder<'copyDir', TFilePath> : never
  slots: Mode extends 'unset' ? () => SlotsHostBuilder<'slots', TFilePath> : never

  ir: () => HostIRBuilder<Mode, TFilePath>

  end: () => ArtifactsBuilder<TFilePath>
}

export interface TextHostBuilder<Mode extends HostMode, TFilePath extends string = string> {
  content: (text: string | (() => string | Promise<string>)) => this
  encoding: (enc: 'utf8' | 'utf16le' | 'latin1') => this
  eol: (eol: 'lf' | 'crlf') => this
  hashInputs: (...inputs: Array<string | number | boolean>) => this
  end: () => HostBuilder<Mode, TFilePath>
}

export interface CopyFileHostBuilder<Mode extends HostMode, TFilePath extends string = string> {
  from: (path: string) => this
  transform: (fn: (input: Uint8Array, ctx: RenderCtx) => Uint8Array | Promise<Uint8Array>) => this
  end: () => HostBuilder<Mode, TFilePath>
}

export interface CopyDirHostBuilder<Mode extends HostMode, TFilePath extends string = string> {
  from: (path: string) => this
  filter: (glob: string | string[]) => this
  ignore: (glob: string | string[]) => this
  mapPath: (fn: (relPath: string) => string) => this
  end: () => HostBuilder<Mode, TFilePath>
}

export interface SlotsHostBuilder<Mode extends HostMode, TFilePath extends string = string> {
  template: (tpl: string | (() => string | Promise<string>)) => this
  slot: (name: SlotName) => SlotDefineBuilder<Mode, TFilePath>
  usePreset: (name: SlotName, preset: SlotPreset) => this
  add: (slot: SlotName, item: SlotItem, opt?: { when?: Record<string, unknown> }) => this
  detectSlots: () => this
  end: () => HostBuilder<Mode, TFilePath>
}

export interface SlotDefineBuilder<Mode extends HostMode, TFilePath extends string = string> {
  preset: (p: SlotPreset) => this
  use: (spec: SlotSpec) => this
  extend: (patch: SlotSpecPatch) => this
  inputFrom: <TIn = unknown>(channel: IRChannel, opt?: { inputId?: string }) => SlotInputBuilder<Mode, TIn, TFilePath>
  end: () => SlotsHostBuilder<Mode, TFilePath>
}

export interface SlotInputBuilder<Mode extends HostMode, TIn = unknown, TFilePath extends string = string> {
  where: (fn: (item: TIn, ctx: InputCtx) => boolean) => this
  map: (fn: (item: TIn, ctx: InputCtx) => SlotItem | SlotItem[] | null) => this

  kind: (kind: string) => this
  key: (fn: (item: TIn, ctx: InputCtx) => string | undefined) => this
  stage: (stage: Stage) => this
  order: (order: number) => this

  sourceModule: (module: ModuleId) => this

  end: () => SlotDefineBuilder<Mode, TFilePath>
}

export interface HostIRBuilder<Mode extends HostMode, TFilePath extends string = string> {
  toHost: (hostIdOrPath: string) => this
  push: <T = unknown>(channel: IRChannel, item: T) => this
  end: () => HostBuilder<Mode, TFilePath>
}

export interface DirBuilder<TFilePath extends string = string> {
  host: (relPath: string) => HostBuilder<'unset', TFilePath>
  file: (relPath: string) => HostBuilder<'unset', TFilePath>
  end: () => ArtifactsBuilder<TFilePath>
}

export type ImportItem
  = | { type: 'sideEffect', from: string }
    | { type: 'default', from: string, name: string }
    | { type: 'namespace', from: string, name: string }
    | { type: 'named', from: string, names: string[], typeOnly?: boolean }

export type DeclItem
  = | { type: 'type', name: string, code: string }
    | { type: 'interface', name: string, code: string }
    | { type: 'const', name: string, code: string }
    | { type: 'fn', name: string, code: string }

export type RegistryEntry
  = | { type: 'route', key: string, path: string, component: string, meta?: unknown }
    | { type: 'component', key: string, name: string, importPath: string, exportName?: string }
    | { type: 'store', key: string, name: string, importPath: string }
    | { type: 'icon', key: string, name: string, importPath: string }

export interface SnippetData { lang: string, code: string }

export interface ArtifactsPresets {
  imports: () => SlotPreset
  decls: () => SlotPreset
  registry: () => SlotPreset
  snippet: () => SlotPreset
}

export interface RegistryHostIRPush {
  targetHostId: HostId
  channel: IRChannel
  item: unknown
  fromHostId: HostId
  sequence: number
}

export interface RegistryHostRecord {
  spec: HostSpec
  owners: string[]
  irStore: Record<IRChannel, unknown[]>
  directContributions: Contribution[]
  outHostDeps: HostId[]
  registrationSeq: number
}

export interface ArtifactsResolutionRecord {
  key: string
  scope: 'host'
  previousOwners: string[]
  nextOwner: string
}

export interface DeclaredHostRecord {
  id: HostId
  owner: string
  path: string
  mode: Exclude<HostMode, 'unset'>
  watchCount: number
  slotCount: number
}

export interface ArtifactsRegistrySnapshot {
  hosts: RegistryHostRecord[]
  graph: {
    hosts: DeclaredHostRecord[]
    resolutions: ArtifactsResolutionRecord[]
    edges: Array<{ fromHostId: HostId, toHostId: HostId }>
  }
}

export interface GenArtifact {
  id: string
  hostId: HostId
  path: string
  ext?: string
  content?: string
  bytes?: Uint8Array
  meta?: Record<string, unknown>
  source?: string
  owner?: string
}

export interface NormalizedArtifact extends GenArtifact {
  path: string
  ext: string
  content?: string
  bytes?: Uint8Array
  hash: string
  size: number
}

export interface ArtifactsStateEntry {
  hash: string
  size: number
  mtimeMs?: number
}

export interface ArtifactsStateSnapshot {
  version: 1
  managed: Record<string, ArtifactsStateEntry>
}

export interface ArtifactsRuntimeRunOptions {
  event?: {
    source: string
    kind: 'init' | 'update' | 'manual'
    changedKeys?: string[]
    payload?: Record<string, unknown>
  }
}

export interface ArtifactsRunStats {
  collectMs: number
  renderMs: number
  normalizeMs: number
  persistMs: number
  totalMs: number
}

export interface ArtifactsRuntimeRunResult {
  event: {
    source: string
    kind: 'init' | 'update' | 'manual'
    changedKeys?: string[]
    payload?: Record<string, unknown>
  }
  mode: ArtifactsMode
  hostCount: number
  artifactCount: number
  writeCount: number
  skipCount: number
  removeCount: number
  writtenPaths: string[]
  skippedPaths: string[]
  removedPaths: string[]
  reportPath?: string
  stats: ArtifactsRunStats
}

export interface ArtifactsLogger {
  debug: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  error: (error: unknown) => void
}

export interface ArtifactsReportConfig {
  enabled?: boolean
  file?: string
}

export interface ArtifactsRuntimeOptions {
  outputDir: string
  mode?: ArtifactsMode
  clean?: boolean
  cacheFile?: string
  debounceMs?: number
  writeConcurrency?: number
  report?: ArtifactsReportConfig
  logger?: Partial<ArtifactsLogger>
  registry: () => ArtifactsRegistrySnapshot
}

export interface ArtifactsReportPayload {
  hosts: Array<{
    id: string
    mode: Exclude<HostMode, 'unset'>
    path: string
    slotCount: number
    watchCount: number
    renderMs: number
  }>
  outputs: {
    written: string[]
    skipped: string[]
    removed: string[]
  }
  stats: {
    hosts: number
    artifacts: number
    writes: number
    skips: number
    removes: number
    timings: ArtifactsRunStats
  }
}

export interface ArtifactsRuntime {
  start: () => Promise<void>
  run: (options?: ArtifactsRuntimeRunOptions) => Promise<ArtifactsRuntimeRunResult>
  plan: () => Promise<PlanResult>
  commit: () => Promise<CommitResult>
  diff: () => Promise<DiffResult>
  explain: (hostIdOrPath: string) => Promise<ExplainResult>
  memoryEntries: () => GenArtifact[]
  close: () => Promise<void>
}
