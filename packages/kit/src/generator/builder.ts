import type {
  ArtifactsBuilder,
  ArtifactsBuilderOptions,
  ArtifactsPolicy,
  ConflictPolicy,
  Contribution,
  CopyDirHostBuilder,
  CopyFileHostBuilder,
  DirBuilder,
  FormatTool,
  HostBuilder,
  HostId,
  HostMode,
  HostSpec,
  HostSpecCopyDir,
  HostSpecCopyFile,
  HostSpecSlots,
  HostSpecText,
  HostWatchDependency,
  InputCtx,
  IRChannel,
  ObserveOptions,
  RegistryHostIRPush,
  ScopedFilePath,
  SlotDefineBuilder,
  SlotInput,
  SlotInputBuilder,
  SlotItem,
  SlotName,
  SlotPreset,
  SlotsHostBuilder,
  SlotSpec,
  SlotSpecPatch,
  TextHostBuilder,
} from './types'
import { useVona } from '../context'
import { presets as builtinPresets, mergeSlotSpec } from './ir'
import { registerArtifactsHost, snapshotArtifactsRegistry } from './registry'
import { createArtifactsRuntime } from './runtime'

const SLOT_MARKER_PATTERNS = [
  /\/\*\s*@vona:slot\s+([\w.-]+)\s*\*\//g,
  /<!--\s*@vona:slot\s+([\w.-]+)\s*-->/g,
  /\/\/\s*@vona:slot\s+([\w.-]+)\s*$/gm,
]
const HOST_ID_PATH_PREFIX = 'path:'

interface HostDraft {
  hostId: HostId
  path?: string
  kind: HostSpec['kind']
  mode: HostMode

  format?: boolean | { tool: FormatTool, options?: Record<string, unknown> }
  observe?: ObserveOptions
  tags: string[]
  allowExternal?: boolean
  conflict?: ConflictPolicy
  watch: HostWatchDependency[]

  text?: {
    content?: string | (() => string | Promise<string>)
    encoding?: 'utf8' | 'utf16le' | 'latin1'
    eol?: 'lf' | 'crlf'
    hashInputs: Array<string | number | boolean>
  }

  copyFile?: {
    from?: string
    transform?: HostSpecCopyFile['transform']
  }

  copyDir?: {
    from?: string
    filter?: string | string[]
    ignore?: string | string[]
    mapPath?: (relPath: string) => string
  }

  slots?: {
    template?: string | (() => string | Promise<string>)
    slots: Record<SlotName, SlotSpec>
    directContributions: Contribution[]
    detectSlots: boolean
    marker?: HostSpecSlots['marker']
  }

  irPushes: RegistryHostIRPush[]
  irSequence: number
}

interface BuilderState {
  owner: string
  filePathScope: Set<string>
  rootPath: string
  format?: { enabled: boolean, tool: FormatTool, options?: Record<string, unknown> }
  observe?: ObserveOptions
  policy: Partial<ArtifactsPolicy>
  vona: ReturnType<typeof useVona>
}

function ensureNonEmpty(input: string, field: string): string {
  const value = input.trim()
  if (!value) {
    throw new Error(`[vona:generate] ${field} must be non-empty`)
  }
  return value
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function toHostIdByFilePath(filePath: string): HostId {
  return `${HOST_ID_PATH_PREFIX}${filePath}`
}

function resolveHostRef(hostRef: string): HostId {
  const normalized = normalizePath(ensureNonEmpty(hostRef, 'ir.toHost.hostRef'))
  if (normalized.startsWith(HOST_ID_PATH_PREFIX)) {
    return normalized
  }
  return toHostIdByFilePath(normalized)
}

function ensurePathInScope(path: string, scope: Set<string>): void {
  if (scope.size === 0) {
    return
  }
  if (!scope.has(path)) {
    throw new Error(`[vona:generate] path "${path}" is out of builder.filePathScope`)
  }
}

function inferSlotNames(template: string): string[] {
  const names = new Set<string>()
  for (const pattern of SLOT_MARKER_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of template.matchAll(pattern)) {
      const slotName = match[1]?.trim()
      if (slotName) {
        names.add(slotName)
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

function createHostDraft(filePath: string): HostDraft {
  return {
    hostId: toHostIdByFilePath(filePath),
    path: filePath,
    kind: 'unknown',
    mode: 'unset',
    tags: [],
    watch: [],
    text: {
      hashInputs: [],
    },
    slots: {
      slots: {},
      directContributions: [],
      detectSlots: false,
      marker: {
        mode: 'auto',
        onMissingMarker: 'error',
      },
    },
    irPushes: [],
    irSequence: 0,
  }
}

function resolveHostKind(path: string | undefined, current: HostSpec['kind']): HostSpec['kind'] {
  if (current !== 'unknown') {
    return current
  }
  if (!path) {
    return 'unknown'
  }
  if (path.endsWith('.d.ts')) {
    return 'dts'
  }
  if (path.endsWith('.ts')) {
    return 'ts'
  }
  if (path.endsWith('.vue')) {
    return 'vue'
  }
  if (path.endsWith('.json')) {
    return 'json'
  }
  if (path.endsWith('.css')) {
    return 'css'
  }
  return 'text'
}

function finalizeHostSpec(draft: HostDraft): HostSpec {
  const path = normalizePath(ensureNonEmpty(draft.path ?? '', `${draft.hostId}.path`))
  const kind = resolveHostKind(path, draft.kind)

  if (draft.mode === 'unset') {
    throw new Error(`[vona:generate] host "${draft.hostId}" must choose one mode`)
  }

  const base = {
    hostId: draft.hostId,
    path,
    kind,
    format: draft.format,
    observe: draft.observe,
    tags: draft.tags.length > 0 ? [...draft.tags] : undefined,
    allowExternal: draft.allowExternal,
    conflict: draft.conflict,
    watch: draft.watch.length > 0 ? [...draft.watch] : undefined,
  }

  if (draft.mode === 'text') {
    const content = draft.text?.content
    if (!content) {
      throw new Error(`[vona:generate] host "${draft.hostId}" text mode requires content()`)
    }
    const spec: HostSpecText = {
      ...base,
      mode: 'text',
      content,
      encoding: draft.text?.encoding,
      eol: draft.text?.eol,
      hashInputs: [...(draft.text?.hashInputs ?? [])],
    }
    return spec
  }

  if (draft.mode === 'copyFile') {
    const from = draft.copyFile?.from
    if (!from) {
      throw new Error(`[vona:generate] host "${draft.hostId}" copyFile mode requires from()`)
    }
    const spec: HostSpecCopyFile = {
      ...base,
      mode: 'copyFile',
      from,
      transform: draft.copyFile?.transform,
    }
    return spec
  }

  if (draft.mode === 'copyDir') {
    const from = draft.copyDir?.from
    if (!from) {
      throw new Error(`[vona:generate] host "${draft.hostId}" copyDir mode requires from()`)
    }
    const spec: HostSpecCopyDir = {
      ...base,
      mode: 'copyDir',
      from,
      filter: draft.copyDir?.filter,
      ignore: draft.copyDir?.ignore,
      mapPath: draft.copyDir?.mapPath,
    }
    return spec
  }

  const slotsDraft = draft.slots!
  const template = slotsDraft.template
  if (!template) {
    throw new Error(`[vona:generate] host "${draft.hostId}" slots mode requires template()`)
  }

  if (slotsDraft.detectSlots && typeof template === 'string') {
    for (const slotName of inferSlotNames(template)) {
      if (!slotsDraft.slots[slotName]) {
        slotsDraft.slots[slotName] = builtinPresets.snippet().spec
      }
    }
  }

  if (Object.keys(slotsDraft.slots).length === 0) {
    throw new Error(`[vona:generate] host "${draft.hostId}" slots mode requires at least one slot()`)
  }

  const spec: HostSpecSlots = {
    ...base,
    mode: 'slots',
    template,
    slots: slotsDraft.slots,
    directContributions: slotsDraft.directContributions,
    marker: slotsDraft.marker,
  }

  return spec
}

function setMode(draft: HostDraft, mode: Exclude<HostMode, 'unset'>): void {
  if (draft.mode !== 'unset' && draft.mode !== mode) {
    throw new Error(`[vona:generate] host "${draft.hostId}" mode already set to "${draft.mode}"`)
  }
  draft.mode = mode
}

function buildInputCtx(hostId: HostId): InputCtx {
  return {
    hostId,
    env: {},
  }
}

function createHostBuilder<TFilePath extends string>(
  state: BuilderState,
  draft: HostDraft,
  rootBuilder: ArtifactsBuilder<TFilePath>,
): HostBuilder<'unset', TFilePath> {
  const api = {
    at(path: TFilePath) {
      const normalized = normalizePath(ensureNonEmpty(path, 'host.path'))
      ensurePathInScope(normalized, state.filePathScope)
      draft.path = normalized
      draft.hostId = toHostIdByFilePath(normalized)
      return api
    },

    kind(kind: HostSpec['kind']) {
      draft.kind = kind
      return api
    },

    ts() {
      draft.kind = 'ts'
      return api
    },

    dts() {
      draft.kind = 'dts'
      return api
    },

    vue() {
      draft.kind = 'vue'
      return api
    },

    format(enabledOrTool: boolean | FormatTool = true, options?: Record<string, unknown>) {
      if (typeof enabledOrTool === 'boolean') {
        draft.format = enabledOrTool
      }
      else {
        draft.format = {
          tool: enabledOrTool,
          options,
        }
      }
      return api
    },

    observe(opt: ObserveOptions) {
      draft.observe = {
        ...opt,
      }
      return api
    },

    tags(...tags: string[]) {
      for (const tag of tags.map(item => item.trim()).filter(Boolean)) {
        if (!draft.tags.includes(tag)) {
          draft.tags.push(tag)
        }
      }
      draft.tags.sort((a, b) => a.localeCompare(b))
      return api
    },

    allowExternal() {
      draft.allowExternal = true
      return api
    },

    conflict(policy: ConflictPolicy) {
      draft.conflict = policy
      return api
    },

    watch(dep: HostWatchDependency) {
      draft.watch.push(dep)
      return api
    },

    watchBy(id: string, subscribe: HostWatchDependency['subscribe']) {
      draft.watch.push({ id, subscribe })
      return api
    },

    text() {
      setMode(draft, 'text')
      const textApi: TextHostBuilder<'text', TFilePath> = {
        content(text: string | (() => string | Promise<string>)) {
          draft.text = {
            ...draft.text,
            content: text,
            hashInputs: [...(draft.text?.hashInputs ?? [])],
          }
          return textApi
        },
        encoding(enc: 'utf8' | 'utf16le' | 'latin1') {
          draft.text = {
            ...draft.text,
            encoding: enc,
            hashInputs: [...(draft.text?.hashInputs ?? [])],
          }
          return textApi
        },
        eol(eol: 'lf' | 'crlf') {
          draft.text = {
            ...draft.text,
            eol,
            hashInputs: [...(draft.text?.hashInputs ?? [])],
          }
          return textApi
        },
        hashInputs(...inputs: Array<string | number | boolean>) {
          draft.text = {
            ...draft.text,
            hashInputs: [...(draft.text?.hashInputs ?? []), ...inputs],
          }
          return textApi
        },
        end() {
          return api as unknown as HostBuilder<'text', TFilePath>
        },
      }
      return textApi as unknown as never
    },

    copyFile() {
      setMode(draft, 'copyFile')
      const copyFileApi: CopyFileHostBuilder<'copyFile', TFilePath> = {
        from(path: string) {
          draft.copyFile = {
            ...draft.copyFile,
            from: ensureNonEmpty(path, 'host.copyFile.from'),
          }
          return copyFileApi
        },
        transform(fn) {
          draft.copyFile = {
            ...draft.copyFile,
            transform: fn,
          }
          return copyFileApi
        },
        end() {
          return api as unknown as HostBuilder<'copyFile', TFilePath>
        },
      }
      return copyFileApi as unknown as never
    },

    copyDir() {
      setMode(draft, 'copyDir')
      const copyDirApi: CopyDirHostBuilder<'copyDir', TFilePath> = {
        from(path: string) {
          draft.copyDir = {
            ...draft.copyDir,
            from: ensureNonEmpty(path, 'host.copyDir.from'),
          }
          return copyDirApi
        },
        filter(glob: string | string[]) {
          draft.copyDir = {
            ...draft.copyDir,
            filter: glob,
          }
          return copyDirApi
        },
        ignore(glob: string | string[]) {
          draft.copyDir = {
            ...draft.copyDir,
            ignore: glob,
          }
          return copyDirApi
        },
        mapPath(fn: (relPath: string) => string) {
          draft.copyDir = {
            ...draft.copyDir,
            mapPath: fn,
          }
          return copyDirApi
        },
        end() {
          return api as unknown as HostBuilder<'copyDir', TFilePath>
        },
      }
      return copyDirApi as unknown as never
    },

    slots() {
      setMode(draft, 'slots')
      const slotsDraft = draft.slots!

      const slotsApi: SlotsHostBuilder<'slots', TFilePath> = {
        template(tpl: string | (() => string | Promise<string>)) {
          slotsDraft.template = tpl
          return slotsApi
        },

        slot(name: SlotName) {
          const slotName = ensureNonEmpty(name, 'slot.name')
          if (!slotsDraft.slots[slotName]) {
            slotsDraft.slots[slotName] = builtinPresets.snippet().spec
          }

          const slotApi: SlotDefineBuilder<'slots', TFilePath> = {
            preset(p: SlotPreset) {
              slotsDraft.slots[slotName] = {
                ...p.spec,
                accepts: p.spec.accepts ? [...p.spec.accepts] : undefined,
                inputs: p.spec.inputs ? [...p.spec.inputs] : undefined,
              }
              return slotApi
            },

            use(spec: SlotSpec) {
              slotsDraft.slots[slotName] = {
                ...spec,
                accepts: spec.accepts ? [...spec.accepts] : undefined,
                inputs: spec.inputs ? [...spec.inputs] : undefined,
              }
              return slotApi
            },

            extend(patch: SlotSpecPatch) {
              slotsDraft.slots[slotName] = mergeSlotSpec(slotsDraft.slots[slotName], patch)
              return slotApi
            },

            inputFrom<TIn = unknown>(channel: IRChannel, opt?: { inputId?: string }) {
              const input: SlotInput<TIn> = {
                from: channel,
                inputId: opt?.inputId,
              }

              const inputApi: SlotInputBuilder<'slots', TIn, TFilePath> = {
                where(fn: (item: TIn, ctx: InputCtx) => boolean) {
                  input.where = fn
                  return inputApi
                },

                map(fn: (item: TIn, ctx: InputCtx) => SlotItem | SlotItem[] | null) {
                  input.map = fn
                  return inputApi
                },

                kind(kind: string) {
                  input.kind = kind
                  return inputApi
                },

                key(fn: (item: TIn, ctx: InputCtx) => string | undefined) {
                  input.key = fn
                  return inputApi
                },

                stage(stage) {
                  input.stage = stage
                  return inputApi
                },

                order(order: number) {
                  input.order = order
                  return inputApi
                },

                sourceModule(module: string) {
                  input.sourceModule = module
                  return inputApi
                },

                end() {
                  const ctx = buildInputCtx(draft.hostId)
                  void ctx
                  const slot = slotsDraft.slots[slotName]
                  slot.inputs = [...(slot.inputs ?? []), input as SlotInput]
                  return slotApi
                },
              }

              return inputApi
            },

            end() {
              return slotsApi
            },
          }

          return slotApi
        },

        usePreset(name: SlotName, preset: SlotPreset) {
          const slotName = ensureNonEmpty(name, 'slot.name')
          slotsDraft.slots[slotName] = {
            ...preset.spec,
            accepts: preset.spec.accepts ? [...preset.spec.accepts] : undefined,
            inputs: preset.spec.inputs ? [...preset.spec.inputs] : undefined,
          }
          return slotsApi
        },

        add(slot: SlotName, item: SlotItem, opt?: { when?: Record<string, unknown> }) {
          slotsDraft.directContributions.push({
            target: {
              hostId: draft.hostId,
              slot,
            },
            payload: item,
            when: opt?.when,
          })
          return slotsApi
        },

        detectSlots() {
          slotsDraft.detectSlots = true
          return slotsApi
        },

        end() {
          return api as unknown as HostBuilder<'slots', TFilePath>
        },
      }

      return slotsApi as unknown as never
    },

    ir() {
      let targetHostId: HostId = draft.hostId
      const irApi = {
        toHost(hostIdOrPath: string) {
          targetHostId = resolveHostRef(hostIdOrPath)
          return irApi
        },

        push<T = unknown>(channel: string, item: T) {
          draft.irSequence += 1
          draft.irPushes.push({
            targetHostId,
            channel: ensureNonEmpty(channel, 'ir.push.channel'),
            item,
            fromHostId: draft.hostId,
            sequence: draft.irSequence,
          })
          return irApi
        },

        end() {
          return api
        },
      }

      return irApi
    },

    end() {
      const spec = finalizeHostSpec(draft)
      registerArtifactsHost({
        owner: state.owner,
        spec,
        directContributions: [...(draft.slots?.directContributions ?? [])],
        irPushes: [...draft.irPushes],
      }, state.vona)
      return rootBuilder
    },
  }

  return api as unknown as HostBuilder<'unset', TFilePath>
}

function createDirBuilder<TFilePath extends string>(
  _state: BuilderState,
  rootBuilder: ArtifactsBuilder<TFilePath>,
  path: string,
): DirBuilder<TFilePath> {
  const basePath = normalizePath(path)
  return {
    host(relPath: string) {
      return rootBuilder.host(normalizePath(`${basePath}/${relPath}`) as TFilePath)
    },
    file(relPath: string) {
      return rootBuilder.host(normalizePath(`${basePath}/${relPath}`) as TFilePath)
    },
    end() {
      return rootBuilder
    },
  }
}

function toRuntimeOptions(state: BuilderState): Parameters<typeof createArtifactsRuntime>[0] {
  const outputDir = state.policy.managedRoot ?? state.rootPath
  return {
    outputDir,
    mode: 'disk',
    clean: state.policy.cleanup === 'remove-orphans',
    cacheFile: '.cache/generate-state.json',
    debounceMs: 0,
    writeConcurrency: state.policy.concurrency,
    registry: () => snapshotArtifactsRegistry(state.vona),
  }
}

export function createArtifactsBuilder<const TScope extends readonly string[] | undefined = undefined>(
  options: ArtifactsBuilderOptions<TScope>,
): ArtifactsBuilder<ScopedFilePath<TScope>> {
  const owner = ensureNonEmpty(options.owner, 'builder.owner')
  const state: BuilderState = {
    owner,
    filePathScope: new Set((options.filePathScope ?? []).map(path => normalizePath(ensureNonEmpty(path, 'builder.filePathScope item')))),
    rootPath: '.',
    policy: {
      managedRoot: '.',
      cleanup: 'keep',
      conflict: 'error',
      concurrency: 8,
      dryRun: false,
    },
    vona: options.vona ?? useVona(),
  }

  const api: ArtifactsBuilder<ScopedFilePath<TScope>> = {
    root(path: string) {
      const normalized = normalizePath(ensureNonEmpty(path, 'builder.root.path'))
      state.rootPath = normalized
      state.policy.managedRoot = normalized
      return api
    },

    format(toolOrEnabled: FormatTool | boolean = true, options?: Record<string, unknown>) {
      if (typeof toolOrEnabled === 'boolean') {
        state.format = {
          enabled: toolOrEnabled,
          tool: 'none',
        }
      }
      else {
        state.format = {
          enabled: true,
          tool: toolOrEnabled,
          options,
        }
      }
      return api
    },

    observe(opt: ObserveOptions) {
      state.observe = {
        ...opt,
      }
      return api
    },

    policy(policy: Partial<ArtifactsPolicy>) {
      state.policy = {
        ...state.policy,
        ...policy,
      }
      return api
    },

    host(filePath: ScopedFilePath<TScope>) {
      const normalized = normalizePath(ensureNonEmpty(filePath, 'host.filePath'))
      ensurePathInScope(normalized, state.filePathScope)
      return createHostBuilder(state, createHostDraft(normalized), api)
    },

    dir(path: string) {
      return createDirBuilder(state, api, path)
    },

    async plan() {
      const runtime = createArtifactsRuntime(toRuntimeOptions(state))
      return runtime.plan()
    },

    async commit() {
      const runtime = createArtifactsRuntime(toRuntimeOptions(state))
      return runtime.commit()
    },

    async explain(hostIdOrPath: string) {
      const runtime = createArtifactsRuntime(toRuntimeOptions(state))
      return runtime.explain(hostIdOrPath)
    },

    async diff() {
      const runtime = createArtifactsRuntime(toRuntimeOptions(state))
      return runtime.diff()
    },
  }

  return api
}
