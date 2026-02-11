import type {
  DeclItem,
  ImportItem,
  InputCtx,
  RegistryEntry,
  RenderCtx,
  SlotInput,
  SlotItem,
  SlotItemFactory,
  SlotPreset,
  SlotSpec,
  SnippetData,
  Stage,
} from './types'

const STAGE_RANK: Record<Stage, number> = {
  pre: 0,
  normal: 1,
  post: 2,
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort((a, b) => a[0].localeCompare(b[0]))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

function compareString(left: string | undefined, right: string | undefined): number {
  return (left ?? '').localeCompare(right ?? '')
}

export function defaultSlotItemSort(left: SlotItem, right: SlotItem): number {
  const stage = (STAGE_RANK[left.stage ?? 'normal'] ?? 1) - (STAGE_RANK[right.stage ?? 'normal'] ?? 1)
  if (stage !== 0) {
    return stage
  }

  const order = (left.order ?? 0) - (right.order ?? 0)
  if (order !== 0) {
    return order
  }

  const kind = left.kind.localeCompare(right.kind)
  if (kind !== 0) {
    return kind
  }

  const key = compareString(left.key, right.key)
  if (key !== 0) {
    return key
  }

  const moduleCmp = left.from.module.localeCompare(right.from.module)
  if (moduleCmp !== 0) {
    return moduleCmp
  }

  const seqLeft = Number(left.meta?.registrationSeq ?? 0)
  const seqRight = Number(right.meta?.registrationSeq ?? 0)
  return seqLeft - seqRight
}

export interface DedupeOptions {
  requireKeyForKinds?: string[]
}

export function defaultDedupeSlotItems(items: SlotItem[], options: DedupeOptions = {}): SlotItem[] {
  const requireKeyKinds = new Set(options.requireKeyForKinds ?? ['snippet'])
  const out: SlotItem[] = []
  const seen = new Set<string>()

  for (const item of items) {
    if (requireKeyKinds.has(item.kind) && !item.key) {
      throw new Error(`[vona:generate] slot item kind "${item.kind}" requires key (from: ${item.from.module})`)
    }

    if (!item.key) {
      out.push(item)
      continue
    }

    if (seen.has(item.key)) {
      continue
    }

    seen.add(item.key)
    out.push(item)
  }

  return out
}

export function cloneSlotInput(input: SlotInput): SlotInput {
  return {
    ...input,
  }
}

export function cloneSlotSpec(spec: SlotSpec): SlotSpec {
  return {
    ...spec,
    accepts: spec.accepts ? [...spec.accepts] : undefined,
    inputs: spec.inputs ? spec.inputs.map(cloneSlotInput) : undefined,
  }
}

export function cloneSlotPreset(preset: SlotPreset): SlotPreset {
  return {
    ...preset,
    spec: cloneSlotSpec(preset.spec),
  }
}

function normalizeLineEndings(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n')
  if (normalized.endsWith('\n')) {
    return normalized
  }
  return `${normalized}\n`
}

function assertImportItem(item: unknown): asserts item is ImportItem {
  if (!item || typeof item !== 'object' || !('type' in item) || !('from' in item)) {
    throw new TypeError('[vona:generate] invalid import item')
  }
}

function assertDeclItem(item: unknown): asserts item is DeclItem {
  if (!item || typeof item !== 'object' || !('type' in item) || !('name' in item) || !('code' in item)) {
    throw new TypeError('[vona:generate] invalid decl item')
  }
}

function assertRegistryEntry(item: unknown): asserts item is RegistryEntry {
  if (!item || typeof item !== 'object' || !('type' in item) || !('key' in item)) {
    throw new TypeError('[vona:generate] invalid registry entry')
  }
}

function assertSnippetData(item: unknown): asserts item is SnippetData {
  if (!item || typeof item !== 'object' || !('code' in item)) {
    throw new TypeError('[vona:generate] invalid snippet data')
  }
}

interface ImportBucket {
  defaultName?: string
  namespaceName?: string
  named: Set<string>
  typeNamed: Set<string>
}

function getImportBucket(map: Map<string, ImportBucket>, from: string): ImportBucket {
  let bucket = map.get(from)
  if (!bucket) {
    bucket = {
      named: new Set<string>(),
      typeNamed: new Set<string>(),
    }
    map.set(from, bucket)
  }
  return bucket
}

function renderImportSpec(items: SlotItem[]): string {
  const sideEffects = new Set<string>()
  const modules = new Map<string, ImportBucket>()

  for (const item of items) {
    assertImportItem(item.data)
    const data = item.data
    if (data.type === 'sideEffect') {
      sideEffects.add(data.from)
      continue
    }

    const bucket = getImportBucket(modules, data.from)
    if (data.type === 'default') {
      if (bucket.defaultName && bucket.defaultName !== data.name) {
        throw new Error(`[vona:generate] import default conflict on "${data.from}"`)
      }
      bucket.defaultName = data.name
      continue
    }

    if (data.type === 'namespace') {
      if (bucket.namespaceName && bucket.namespaceName !== data.name) {
        throw new Error(`[vona:generate] import namespace conflict on "${data.from}"`)
      }
      bucket.namespaceName = data.name
      continue
    }

    const target = data.typeOnly ? bucket.typeNamed : bucket.named
    for (const name of data.names) {
      target.add(name)
    }
  }

  const lines: string[] = []
  for (const from of [...sideEffects].sort((a, b) => a.localeCompare(b))) {
    lines.push(`import '${from}'`)
  }

  for (const from of [...modules.keys()].sort((a, b) => a.localeCompare(b))) {
    const bucket = modules.get(from)!
    const valueParts: string[] = []

    if (bucket.defaultName) {
      valueParts.push(bucket.defaultName)
    }

    if (bucket.namespaceName) {
      valueParts.push(`* as ${bucket.namespaceName}`)
    }

    if (bucket.named.size > 0) {
      valueParts.push(`{ ${[...bucket.named].sort((a, b) => a.localeCompare(b)).join(', ')} }`)
    }

    if (valueParts.length > 0) {
      lines.push(`import ${valueParts.join(', ')} from '${from}'`)
    }

    if (bucket.typeNamed.size > 0) {
      lines.push(`import type { ${[...bucket.typeNamed].sort((a, b) => a.localeCompare(b)).join(', ')} } from '${from}'`)
    }
  }

  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

function renderDeclSpec(items: SlotItem[]): string {
  const data = items.map((item) => {
    assertDeclItem(item.data)
    return item.data
  })
  data.sort((a, b) => {
    const t = a.type.localeCompare(b.type)
    if (t !== 0) {
      return t
    }
    return a.name.localeCompare(b.name)
  })
  const blocks = data.map(item => item.code.trim())
  if (blocks.length === 0) {
    return ''
  }
  return `${blocks.join('\n\n')}\n`
}

function renderRegistrySpec(items: SlotItem[]): string {
  const map = new Map<string, RegistryEntry>()
  for (const item of items) {
    assertRegistryEntry(item.data)
    const data = item.data
    const existing = map.get(data.key)
    if (existing && stableStringify(existing) !== stableStringify(data)) {
      throw new Error(`[vona:generate] registry entry conflict on key "${data.key}"`)
    }
    map.set(data.key, data)
  }

  const rows = [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
  return `${JSON.stringify(rows, null, 2)}\n`
}

function renderSnippetSpec(items: SlotItem[]): string {
  const lines: string[] = []
  for (const item of items) {
    assertSnippetData(item.data)
    const code = item.data.code.trimEnd()
    if (!code) {
      continue
    }
    lines.push(code)
  }
  if (lines.length === 0) {
    return ''
  }
  return `${lines.join('\n\n')}\n`
}

function createSlotItemFactory<TData>(kind: string): (data: TData, opt?: Partial<Omit<SlotItem<TData>, 'kind' | 'data'>>) => SlotItem<TData> {
  return (data, opt) => ({
    kind,
    data,
    from: {
      module: opt?.from?.module ?? 'unknown',
      version: opt?.from?.version,
      trace: opt?.from?.trace,
    },
    stage: opt?.stage,
    order: opt?.order,
    key: opt?.key,
    inputId: opt?.inputId,
    meta: opt?.meta,
  })
}

function baseRender<T extends SlotItem>(fn: (items: T[]) => string): (items: T[], _ctx: RenderCtx) => string {
  return items => normalizeLineEndings(fn(items) || '')
}

export const presets = {
  imports(): SlotPreset {
    return {
      name: 'imports',
      spec: {
        accepts: ['import'],
        render: baseRender(renderImportSpec),
      },
      factory: {
        kind: 'import',
        make: createSlotItemFactory<ImportItem>('import') as SlotItemFactory['make'],
      },
    }
  },

  decls(): SlotPreset {
    return {
      name: 'decls',
      spec: {
        accepts: ['decl'],
        render: baseRender(renderDeclSpec),
      },
      factory: {
        kind: 'decl',
        make: createSlotItemFactory<DeclItem>('decl') as SlotItemFactory['make'],
      },
    }
  },

  registry(): SlotPreset {
    return {
      name: 'registry',
      spec: {
        accepts: ['registry'],
        render: baseRender(renderRegistrySpec),
      },
      factory: {
        kind: 'registry',
        make: createSlotItemFactory<RegistryEntry>('registry') as SlotItemFactory['make'],
      },
    }
  },

  snippet(): SlotPreset {
    return {
      name: 'snippet',
      spec: {
        accepts: ['snippet'],
        render: baseRender(renderSnippetSpec),
      },
      factory: {
        kind: 'snippet',
        make: createSlotItemFactory<SnippetData>('snippet') as SlotItemFactory['make'],
      },
    }
  },
}

export function createSlotItemFromInput(
  input: SlotInput,
  raw: unknown,
  ctx: InputCtx,
  fallbackModule: string,
): SlotItem[] {
  if (input.where && !input.where(raw, ctx)) {
    return []
  }

  const mapped = input.map
    ? input.map(raw, ctx)
    : {
        kind: input.kind ?? 'snippet',
        data: raw,
        from: { module: input.sourceModule ?? fallbackModule },
      }

  if (!mapped) {
    return []
  }

  const items = Array.isArray(mapped) ? mapped : [mapped]
  return items.map((item) => {
    const out: SlotItem = {
      ...item,
      kind: item.kind || input.kind || 'snippet',
      from: {
        module: item.from?.module ?? input.sourceModule ?? fallbackModule,
        version: item.from?.version,
        trace: item.from?.trace,
      },
      stage: item.stage ?? input.stage,
      order: item.order ?? input.order,
      key: item.key ?? input.key?.(raw, ctx),
      inputId: item.inputId ?? input.inputId,
      meta: item.meta,
    }
    return out
  })
}

export function mergeSlotSpec(baseSpec: SlotSpec, patch: {
  accepts?: string[] | ((prev?: string[]) => string[])
  map?: SlotSpec['map']
  sort?: SlotSpec['sort']
  dedupe?: SlotSpec['dedupe']
  render?: SlotSpec['render']
  addInputs?: SlotInput[]
  replaceInputs?: SlotInput[]
}): SlotSpec {
  const spec = cloneSlotSpec(baseSpec)

  if (patch.accepts) {
    spec.accepts = typeof patch.accepts === 'function'
      ? patch.accepts(spec.accepts)
      : [...patch.accepts]
  }

  if (patch.map) {
    spec.map = patch.map
  }
  if (patch.sort) {
    spec.sort = patch.sort
  }
  if (patch.dedupe) {
    spec.dedupe = patch.dedupe
  }
  if (patch.render) {
    spec.render = patch.render
  }

  if (patch.replaceInputs) {
    spec.inputs = patch.replaceInputs.map(cloneSlotInput)
  }
  else if (patch.addInputs?.length) {
    spec.inputs = [...(spec.inputs ?? []), ...patch.addInputs.map(cloneSlotInput)]
  }

  return spec
}
