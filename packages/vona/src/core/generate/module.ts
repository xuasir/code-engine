import type { OVFS, Vona } from '@vona-js/schema'
import { defineModule, useLogger } from '@vona-js/kit'
import { generateDTS } from '@vona-js/kit/internal'
import { debounce } from '@vona-js/utils'
import { ensureDir, writeFile } from 'fs-extra'
import { join } from 'pathe'

export interface GenerateModuleOptions {
  outputDir?: string
}

export default defineModule({
  meta: {
    name: 'vona:generate',
    version: '0.0.1',
    configKey: 'generate',
  },
  defaults: (): GenerateModuleOptions => ({
    outputDir: '.vona',
  }),
  async setup(options: GenerateModuleOptions, vona: Vona) {
    const logger = useLogger('vona:generate')

    if (vona.options.__command?.name !== 'prepare') {
      logger.debug('prepare command not running')
      return false
    }

    const outputDir = join(vona.options.__rootDir, options.outputDir!)
    await ensureDir(outputDir)
    const dtsPath = join(outputDir, 'types.d.ts')

    const writeTypes = async (): Promise<void> => {
      const dts = generateDTS(vona.ovfs.toManifest())
      await writeFile(dtsPath, dts)
    }

    const writeTypesDebounced = debounce(() => {
      void writeTypes().catch((error) => {
        logger.error(error)
      })
    }, 80)

    const printOVFSTreeDebounced = createPrintOVFSTreeDebounced(vona.ovfs, (msg) => {
      logger.info(msg)
    })

    vona.hook('ovfs:change', (_changes) => {
      // 基于 ovfs 打印资源树
      printOVFSTreeDebounced()
      writeTypesDebounced()
    })
  },
})

function buildOVFSTreeLines(ovfs: OVFS): string[] {
  const lines: string[] = []
  const stats = ovfs.stats()
  lines.push('统计')
  lines.push(`  total: ${stats.totalResources}`)

  const layerMap = new Map<string, { priority: number, order: number }>()
  const allEntries = ovfs.entries()
  for (const entry of allEntries) {
    for (const asset of entry.stack) {
      const id = asset.meta.layerId
      if (!layerMap.has(id)) {
        layerMap.set(id, { priority: asset.meta.priority, order: asset.meta.layerOrder })
      }
    }
  }
  const layers = [...layerMap.entries()].sort((a, b) => {
    const ap = a[1].priority
    const bp = b[1].priority
    if (ap !== bp)
      return bp - ap
    return a[1].order - b[1].order
  })
  lines.push('Layers')
  for (let i = 0; i < layers.length; i++) {
    const [id, info] = layers[i]
    const last = i === layers.length - 1
    const branch = last ? '└─ ' : '├─ '
    lines.push(`  ${branch}${id} [p=${info.priority} o=${info.order}]`)
  }
  const types = [...new Set(allEntries.map(entry => entry.type))]
  for (const type of types) {
    const entriesByType = ovfs.entries(type)
    if (entriesByType.length === 0)
      continue

    lines.push(type)
    interface Node { children: Map<string, Node>, layer?: string }
    const root: Map<string, Node> = new Map()

    const insert = (parts: string[], layerId: string): void => {
      let curr = root
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        let next = curr.get(part)
        if (!next) {
          next = { children: new Map() }
          curr.set(part, next)
        }
        if (i === parts.length - 1) {
          next.layer = layerId
        }
        curr = next.children
      }
    }

    for (const entry of entriesByType) {
      const name = entry.path.slice(type.length + 1)
      const parts = name.split('/').filter(Boolean)
      insert(parts.length > 0 ? parts : ['index'], entry.winner.meta.layerId)
    }

    const render = (node: Map<string, Node>, prefix: string): void => {
      const entries = [...node.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      for (let i = 0; i < entries.length; i++) {
        const [key, child] = entries[i]
        const last = i === entries.length - 1
        const branch = last ? '└─ ' : '├─ '
        const hasChildren = child.children.size > 0
        const suffix = !hasChildren && child.layer ? ` (layer: ${child.layer})` : ''
        lines.push(`${prefix}${branch}${key}${suffix}`)
        const nextPrefix = `${prefix}${last ? '   ' : '│  '}`
        if (hasChildren) {
          render(child.children, nextPrefix)
        }
      }
    }
    render(root, '  ')
  }
  return lines
}

function createPrintOVFSTreeDebounced(ovfs: OVFS, log: (msg: string) => void): () => void {
  return debounce(() => {
    const lines = buildOVFSTreeLines(ovfs)
    if (lines.length > 0) {
      log(lines.join('\n'))
    }
  }, 80)
}
