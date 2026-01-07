import type { CodeEngineLayer, CodeEngineLayerDefinition, LayerOptions, ScanConfig, ScanTypeEnum } from '@a-sir/code-engine-schema'
import type { FSWatcher } from 'chokidar'
import { relative } from 'node:path'
import { debounce } from '@a-sir/code-engine-kit'
import { watch } from 'chokidar'
import micromatch from 'micromatch'
import { defaultPatterns, scanAndMerge } from './loader'

/**
 * 创建 Layer 监听器
 * 监听文件变化并触发局部重新扫描。
 */
export function watchLayers(
  layers: CodeEngineLayerDefinition[],
  options: LayerOptions,
  onUpdate: (type: ScanTypeEnum, data: CodeEngineLayer[]) => void,
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
  // 根据选项预先计算每种类型的活动模式
  const typeConfigs = (Object.keys(defaultPatterns) as ScanTypeEnum[]).reduce((acc, type) => {
    const typeConfig = options[type as Exclude<keyof LayerOptions, 'name' | 'enabled'>]

    if (typeConfig && typeConfig.enabled === false)
      return acc

    const dirName = typeConfig?.name || type // 默认目录名假设与加载器逻辑匹配
    const patterns = typeConfig?.pattern || defaultPatterns[type]

    acc[type] = {
      dirName,
      patterns: Array.isArray(patterns) ? patterns : [patterns],
    }
    return acc
  }, {} as Record<ScanTypeEnum, { dirName: string, patterns: string[] }>)

  // 3. 批量更新机制
  const dirtyTypes = new Set<ScanTypeEnum>()

  const flush = debounce(async () => {
    const typesToUpdate = Array.from(dirtyTypes)
    dirtyTypes.clear()

    await Promise.all(typesToUpdate.map(async (type) => {
      const typeConfig = options[type as Exclude<keyof LayerOptions, 'name' | 'enabled'>]

      const scanConfig: ScanConfig = {
        type,
        name: typeConfig?.name || type as string,
        pattern: typeConfig?.pattern || defaultPatterns[type],
        ignore: typeConfig?.ignore,
      }

      try {
        const newData = await scanAndMerge(layers, scanConfig)
        onUpdate(type, newData)
      }
      catch (e) {
        console.error(`[CodeEngine] Re-scan failed for ${type}`, e)
      }
    }))
  }, 100)

  // 4. 文件变更处理程序
  const onFileChange = (filePath: string): void => {
    const type = resolvePathType(filePath, sortedLayers, typeConfigs)
    if (type) {
      dirtyTypes.add(type)
      flush()
    }
  }

  watcher.on('add', onFileChange)
  watcher.on('unlink', onFileChange)

  return watcher
}

/**
 * 辅助函数：解析文件属于哪种 ScanType
 */
function resolvePathType(
  filePath: string,
  sortedLayers: CodeEngineLayerDefinition[],
  typeConfigs: Record<ScanTypeEnum, { dirName: string, patterns: string[] }>,
): ScanTypeEnum | null {
  // 1. 匹配 Layer (最长前缀匹配以支持嵌套路径)
  // sortedLayers 已按路径长度降序排列，因此第一个匹配项即为最长匹配
  let layerRoot = ''
  for (const layer of sortedLayers) {
    if (filePath.startsWith(layer.cwd)) {
      layerRoot = layer.cwd
      break // 找到最长匹配，立即停止
    }
  }

  if (!layerRoot)
    return null

  // 2. 计算 Layer 内的相对路径
  // 例如 "components/Button.vue"
  const relPath = relative(layerRoot, filePath).replace(/\\/g, '/')

  // 3. 匹配配置的类型
  for (const [type, config] of Object.entries(typeConfigs)) {
    const enumType = type as ScanTypeEnum
    const prefix = `${config.dirName}/`

    if (relPath.startsWith(prefix)) {
      // 例如 "components/Button.vue" starts with "components/"
      const scanRelPath = relPath.slice(prefix.length) // "Button.vue"

      if (micromatch.isMatch(scanRelPath, config.patterns)) {
        return enumType
      }
    }
  }

  return null
}
