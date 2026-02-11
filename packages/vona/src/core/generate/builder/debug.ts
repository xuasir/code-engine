import type { Vona } from '@vona-js/schema'
import { createArtifactsBuilder } from '@vona-js/kit'
import { snapshotArtifactsRegistry } from '@vona-js/kit/internal'

/**
 * debug builder
 * .debug/manifest.json  ovfs的调试清单文件
 * .debug/ovfs-report.json  ovfs的调试报告文件
 * .debug/layer-report.json  layer的调试报告文件
 * .debug/generate-report.json  generate的调试报告文件
 */

export const CORE_DEBUG_ARTIFACT_OWNER = '__vona_internal__:core:generate:debug'
export const CORE_DEBUG_FILE_SCOPE = [
  '.debug/manifest.json',
  '.debug/ovfs-report.json',
  '.debug/layer-report.json',
  '.debug/generate-report.json',
] as const

export const CORE_DEBUG_FILES = {
  manifest: '.debug/manifest.json',
  ovfsReport: '.debug/ovfs-report.json',
  layerReport: '.debug/layer-report.json',
  generateReport: '.debug/generate-report.json',
} as const

interface OVFSReportState {
  changedAt: string | null
  totalEvents: number
  reasons: Record<string, number>
  lastChanges: Array<{
    type: string
    path: string
    resourceType: string
    reason?: string
  }>
}

function createDebugArtifactsBuilder(vona: Vona): ReturnType<typeof createArtifactsBuilder<typeof CORE_DEBUG_FILE_SCOPE>> {
  return createArtifactsBuilder({
    owner: CORE_DEBUG_ARTIFACT_OWNER,
    filePathScope: CORE_DEBUG_FILE_SCOPE,
    vona,
  })
}

type DebugArtifactsBuilder = ReturnType<typeof createDebugArtifactsBuilder>
const debugBuilderByVona = new WeakMap<Vona, DebugArtifactsBuilder>()
const debugSetupByVona = new WeakSet<Vona>()

// 提供给其他 Module 获取 debug builder （单例）
export function useDebugBuilder(vona: Vona): DebugArtifactsBuilder {
  const cached = debugBuilderByVona.get(vona)
  if (cached) {
    return cached
  }

  const builder = createDebugArtifactsBuilder(vona)
  debugBuilderByVona.set(vona, builder)
  return builder
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function createOVFSReportState(): OVFSReportState {
  return {
    changedAt: null,
    totalEvents: 0,
    reasons: {},
    lastChanges: [],
  }
}

// 在 GenerateModule 中启用 debug builder
export function setupDebugBuilder(vona: Vona): void {
  if (debugSetupByVona.has(vona)) {
    return
  }
  debugSetupByVona.add(vona)

  const debugBuilder = useDebugBuilder(vona)
  const ovfsReportState = createOVFSReportState()

  debugBuilder
    .host(CORE_DEBUG_FILES.manifest)
    .kind('json')
    .watchBy('ovfs:manifest', emit => vona.ovfs.subscribe(() => emit.emit('ovfs:manifest')))
    .text()
    .content(() => {
      return toJson(vona.ovfs.toManifest())
    })
    .end()
    .end()

  debugBuilder
    .host(CORE_DEBUG_FILES.ovfsReport)
    .kind('json')
    .watchBy('ovfs:report', (emit) => {
      return vona.ovfs.subscribe((changes) => {
        ovfsReportState.changedAt = new Date().toISOString()
        ovfsReportState.totalEvents += 1
        for (const change of changes) {
          const reason = change.reason ?? 'unknown'
          ovfsReportState.reasons[reason] = (ovfsReportState.reasons[reason] ?? 0) + 1
        }
        ovfsReportState.lastChanges = changes.map(change => ({
          type: change.type,
          path: change.path,
          resourceType: change.resourceType,
          reason: change.reason,
        }))
        emit.emit('ovfs:report')
      })
    })
    .text()
    .content(() => {
      return toJson({
        ovfs: {
          stats: vona.ovfs.stats(),
          ...ovfsReportState,
        },
      })
    })
    .end()
    .end()

  debugBuilder
    .host(CORE_DEBUG_FILES.layerReport)
    .kind('json')
    .watchBy('ovfs:layer-report', emit => vona.ovfs.subscribe(() => emit.emit('ovfs:layer-report')))
    .text()
    .content(() => {
      const layers = vona.layerRegistry.getOrdered()
      return toJson({
        layers,
        optionsLayers: vona.options.__layers ?? [],
        layerConfig: vona.options.layer,
      })
    })
    .end()
    .end()

  debugBuilder
    .host(CORE_DEBUG_FILES.generateReport)
    .kind('json')
    .watchBy('ovfs:generate-report', emit => vona.ovfs.subscribe(() => emit.emit('ovfs:generate-report')))
    .text()
    .content(() => {
      const snapshot = snapshotArtifactsRegistry(vona)
      return toJson({
        command: vona.options.__command?.name,
        generateConfig: vona.options.generate,
        registry: {
          hostCount: snapshot.hosts.length,
          edgeCount: snapshot.graph.edges.length,
          resolutions: snapshot.graph.resolutions,
          hosts: snapshot.graph.hosts,
        },
      })
    })
    .end()
    .end()
}
