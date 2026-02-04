import type { LayerOptions, ScanTypeEnum, Vona, VonaLayerDefinition } from '@vona-js/schema'
import type { FSWatcher } from 'chokidar'
import { basename, join, relative } from 'node:path'
import { debounce } from '@vona-js/kit'
import { watch } from 'chokidar'
import micromatch from 'micromatch'
import { defaultPatterns, resolveLayerId, syncVfsToLayerMap } from './loader'

/**
 * 创建 Layer 监听器
 * 监听文件变化并触发 VFS 更新。
 */
export function watchLayers(
  ce: Vona,
  layers: VonaLayerDefinition[],
  options: LayerOptions,
): FSWatcher {
  // 0. 预排序 Layer (按路径长度降序)
  // 这样在 resolvePathType 中找到的第一个匹配项即为最长匹配
  const sortedLayers = [...layers].sort((a, b) => b.cwd.length - a.cwd.length)

  // 1. 监听所有 Layer 的根目录
  const cwds = layers.map(l => l.cwd)
  const watcher = watch(cwds, {
    ignoreInitial: true,
    ignorePermissionErrors: true,
  })

  // 2. 准备模式配置
  const typeConfigs = (Object.keys(defaultPatterns) as ScanTypeEnum[]).reduce((acc, type) => {
    const typeConfig = options[type as Exclude<keyof LayerOptions, 'name' | 'enabled'>]

    if (typeConfig && typeConfig.enabled === false)
      return acc

    const dirName = typeConfig?.name || type
    const patterns = typeConfig?.pattern || defaultPatterns[type]

    acc[type] = {
      dirName,
      patterns: Array.isArray(patterns) ? patterns : [patterns],
    }
    return acc
  }, {} as Record<ScanTypeEnum, { dirName: string, patterns: string[] }>)

  // 3. 批量更新机制
  // 我们不需要按 Type 批量，只需要 debounced sync

  const flush = debounce(async () => {
    // 重新生成 layer map
    await syncVfsToLayerMap(ce, options)
    // 触发 hook
    // 暂时通过 layerMap 引用更新，或者在这里 callHook 'layer:updated'?
    // ce.callHook('layer:updated', ...) if exists.
  }, 100)

  // 4. 文件变更处理程序
  const onFileChange = async (event: 'add' | 'change' | 'unlink', filePath: string): Promise<void> => {
    // 解析文件属于哪个 Layer 和 Type
    const result = resolvePathInfo(filePath, sortedLayers, typeConfigs)
    if (!result)
      return

    const { layerDef, type, relPath } = result
    const { dirName } = typeConfigs[type]

    // relPath 例如 "components/Button.vue"
    // 我们需要 id.
    // relPath 包含 dirName. loader.ts 里 fg returns relative to layerDir (which is cwd/dirName).
    // result.relPath is relative to layerRoot.
    // So scanRelativePath = relative(dirName, relPath)

    // 检查是否在 dirName 下
    // 简单的检查: relPath startsWith dirName
    // 注意: resolvePathInfo 已经做过检查

    // 获取相对 scan dir 的路径
    const scanRelativePath = relative(dirName, relPath)

    // 计算 ID
    // resolveLayerId 期望的是 relative to scan dir 的 file path
    // e.g. "Button.vue" or "base/Button.vue"
    const id = resolveLayerId(scanRelativePath, type)

    const virtualPath = join('/', dirName, id)

    // Scope
    const layerName = basename(layerDef.cwd)
    const scope = ce.vfs.scope({
      name: layerName,
      priority: layerDef.priority || 0,
    })

    if (event === 'unlink') {
      scope.remove(virtualPath)
    }
    else {
      // add or change
      const patterns = typeConfigs[type].patterns
      scope.mount(virtualPath, filePath, {
        originalPath: scanRelativePath,
        pattern: patterns[0], // 简单传一个
      })
    }

    flush()
  }

  watcher.on('add', path => onFileChange('add', path))
  watcher.on('change', path => onFileChange('change', path))
  watcher.on('unlink', path => onFileChange('unlink', path))

  return watcher
}

/**
 * 辅助函数：解析文件信息
 */
function resolvePathInfo(
  filePath: string,
  sortedLayers: VonaLayerDefinition[],
  typeConfigs: Record<ScanTypeEnum, { dirName: string, patterns: string[] }>,
): { layerDef: VonaLayerDefinition, type: ScanTypeEnum, relPath: string } | null {
  // 1. 匹配 Layer
  let layerDef: VonaLayerDefinition | null = null
  for (const layer of sortedLayers) {
    if (filePath.startsWith(layer.cwd)) {
      layerDef = layer
      break
    }
  }

  if (!layerDef)
    return null

  // 2. 计算 Layer 内的相对路径
  const relPath = relative(layerDef.cwd, filePath).replace(/\\/g, '/')

  // 3. 匹配配置的类型
  for (const [type, config] of Object.entries(typeConfigs)) {
    const enumType = type as ScanTypeEnum
    const prefix = `${config.dirName}/`

    if (relPath.startsWith(prefix)) {
      const scanRelPath = relPath.slice(prefix.length)
      if (micromatch.isMatch(scanRelPath, config.patterns)) {
        return { layerDef, type: enumType, relPath }
      }
    }
  }

  return null
}
