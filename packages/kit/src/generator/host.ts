import type {
  ExplainResult,
  HostSpecSlots,
  InputCtx,
  ObserveOptions,
  RegistryHostRecord,
  RenderCtx,
  SlotItem,
} from './types'
import {
  createSlotItemFromInput,
  defaultDedupeSlotItems,
  defaultSlotItemSort,
} from './ir'

export interface RenderSlotsHostOptions {
  env?: Record<string, unknown>
  observe?: ObserveOptions
  format?: {
    enabled: boolean
    tool: string
    options?: Record<string, unknown>
  }
}

export interface RenderSlotsHostResult {
  content: string
  slots: NonNullable<ExplainResult['slots']>
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeEol(content: string, eol: 'lf' | 'crlf' = 'lf'): string {
  const normalized = content.replace(/\r\n?/g, '\n')
  if (eol === 'crlf') {
    return normalized.replace(/\n/g, '\r\n')
  }
  return normalized
}

function indentText(content: string, indent: string): string {
  const lines = normalizeEol(content, 'lf').split('\n')
  const out = lines.map((line) => {
    if (!line) {
      return line
    }
    return `${indent}${line}`
  })
  return out.join('\n')
}

function ensureTrailingNewline(content: string): string {
  if (!content) {
    return ''
  }
  if (content.endsWith('\n')) {
    return content
  }
  return `${content}\n`
}

function getSlotMarkerMatches(template: string, slotName: string): Array<{ index: number, length: number, indent: string }> {
  const escaped = escapeRegex(slotName)
  const pattern = new RegExp(
    `(^[\\t ]*)(?:/\\*\\s*@vona:slot\\s+${escaped}\\s*\\*/|<!--\\s*@vona:slot\\s+${escaped}\\s*-->|//\\s*@vona:slot\\s+${escaped})\\s*$`,
    'gm',
  )

  const matches: Array<{ index: number, length: number, indent: string }> = []
  for (const match of template.matchAll(pattern)) {
    const text = match[0] ?? ''
    const index = match.index ?? 0
    matches.push({
      index,
      length: text.length,
      indent: match[1] ?? '',
    })
  }

  return matches
}

function patchSlotIntoTemplate(
  template: string,
  slotName: string,
  slotText: string,
  marker: HostSpecSlots['marker'] | undefined,
): string {
  const matches = getSlotMarkerMatches(template, slotName)
  if (matches.length === 0) {
    if (marker?.onMissingMarker === 'ignore') {
      return template
    }
    throw new Error(`[vona:generate] host slot "${slotName}" marker not found in template`)
  }

  if (matches.length > 1) {
    throw new Error(`[vona:generate] host slot "${slotName}" marker appears more than once`)
  }

  const match = matches[0]
  const replacement = indentText(ensureTrailingNewline(slotText), match.indent)
  return `${template.slice(0, match.index)}${replacement}${template.slice(match.index + match.length)}`
}

function createRenderCtx(host: HostSpecSlots, options: RenderSlotsHostOptions): RenderCtx {
  const format = options.format ?? {
    enabled: false,
    tool: 'none',
  }

  return {
    hostId: host.hostId,
    hostPath: host.path,
    kind: host.kind,
    format: {
      enabled: format.enabled,
      tool: format.tool,
      options: format.options,
    },
    observe: options.observe ?? {},
    env: options.env ?? {},
    utils: {
      normalizeEol,
      indent(content: string, spaces: number) {
        return indentText(content, ' '.repeat(Math.max(0, spaces)))
      },
    },
  }
}

function withRegistrationMeta(item: SlotItem, sequence: number): SlotItem {
  return {
    ...item,
    meta: {
      ...(item.meta ?? {}),
      registrationSeq: sequence,
    },
  }
}

function collectSlotItems(hostRecord: RegistryHostRecord, slotName: string, renderCtx: RenderCtx): SlotItem[] {
  const host = hostRecord.spec
  if (host.mode !== 'slots') {
    return []
  }

  const slot = host.slots[slotName]
  const inputCtx: InputCtx = {
    hostId: host.hostId,
    env: renderCtx.env,
  }

  const bucket: SlotItem[] = []
  let sequence = 0

  for (const contribution of hostRecord.directContributions) {
    if (contribution.target.slot !== slotName) {
      continue
    }
    sequence += 1
    const payload = contribution.payload
    bucket.push(withRegistrationMeta({
      ...payload,
      from: {
        module: payload.from?.module ?? hostRecord.owners[0] ?? 'unknown',
        version: payload.from?.version,
        trace: payload.from?.trace,
      },
    }, sequence))
  }

  for (const input of slot.inputs ?? []) {
    const source = hostRecord.irStore[input.from] ?? []
    for (const raw of source) {
      const mapped = createSlotItemFromInput(input, raw, inputCtx, hostRecord.owners[0] ?? 'unknown')
      for (const next of mapped) {
        sequence += 1
        bucket.push(withRegistrationMeta(next, sequence))
      }
    }
  }

  return bucket
}

function ensureAccepted(hostId: string, slotName: string, items: SlotItem[], accepted?: string[]): void {
  if (!accepted || accepted.length === 0) {
    return
  }

  for (const item of items) {
    if (!accepted.includes(item.kind)) {
      throw new Error(`[vona:generate] host "${hostId}" slot "${slotName}" does not accept payload "${item.kind}"`)
    }
  }
}

function renderSlot(hostRecord: RegistryHostRecord, slotName: string, renderCtx: RenderCtx): { text: string, items: SlotItem[] } {
  const host = hostRecord.spec
  if (host.mode !== 'slots') {
    return { text: '', items: [] }
  }

  const slot = host.slots[slotName]
  const collected = collectSlotItems(hostRecord, slotName, renderCtx)
  ensureAccepted(host.hostId, slotName, collected, slot.accepts)

  const deduped = slot.dedupe
    ? slot.dedupe(collected, renderCtx)
    : defaultDedupeSlotItems(collected)

  const sorted = [...deduped]
  sorted.sort((left, right) => {
    if (slot.sort) {
      return slot.sort(left, right, renderCtx)
    }
    return defaultSlotItemSort(left, right)
  })

  const mapped = slot.map
    ? sorted
        .map(item => slot.map!(item, renderCtx))
        .filter((item): item is SlotItem => item !== null)
    : sorted

  ensureAccepted(host.hostId, slotName, mapped, slot.accepts)

  const rendered = slot.render(mapped, renderCtx)
  return {
    text: ensureTrailingNewline(normalizeEol(rendered, 'lf')),
    items: mapped,
  }
}

export async function renderSlotsHost(
  hostRecord: RegistryHostRecord,
  options: RenderSlotsHostOptions = {},
): Promise<RenderSlotsHostResult> {
  const host = hostRecord.spec
  if (host.mode !== 'slots') {
    throw new Error('[vona:generate] renderSlotsHost only supports slots mode')
  }

  const template = typeof host.template === 'function'
    ? await host.template()
    : host.template

  const renderCtx = createRenderCtx(host, options)
  let output = normalizeEol(template, 'lf')
  const explainSlots: NonNullable<ExplainResult['slots']> = []

  for (const slotName of Object.keys(host.slots)) {
    const result = renderSlot(hostRecord, slotName, renderCtx)
    output = patchSlotIntoTemplate(output, slotName, result.text, host.marker)

    explainSlots.push({
      slot: slotName,
      accepts: host.slots[slotName].accepts,
      items: result.items.map(item => ({
        kind: item.kind,
        key: item.key,
        from: item.from,
        stage: item.stage,
        order: item.order,
        inputId: item.inputId,
      })),
    })
  }

  return {
    content: ensureTrailingNewline(normalizeEol(output, 'lf')),
    slots: explainSlots,
  }
}
