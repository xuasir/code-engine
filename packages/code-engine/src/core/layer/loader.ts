import type { CodeEngine, CodeEngineLayer, CodeEngineLayerDefinition, LayerOptions } from '@a-sir/code-engine-schema'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { getLayerKey, useProvide } from '@a-sir/code-engine-kit'
import { ScanTypeEnum } from '@a-sir/code-engine-schema'
import fg from 'fast-glob'
import { camelCase, kebabCase, pascalCase } from 'scule'

// 默认 Patterns
export const defaultPatterns: Record<ScanTypeEnum, string[]> = {
  [ScanTypeEnum.Component]: ['**/*.{vue,jsx,tsx,ts}'],
  [ScanTypeEnum.Page]: ['**/*.{vue,jsx,tsx}'],
  [ScanTypeEnum.Layout]: ['**/*.{vue,jsx,tsx}'],
  [ScanTypeEnum.Composable]: ['**/*.{ts,js}'],
  [ScanTypeEnum.Store]: ['**/*.{ts,js}'],
  [ScanTypeEnum.Util]: ['**/*.{ts,js}'],
  [ScanTypeEnum.Api]: ['**/*.{ts,js}'],
  [ScanTypeEnum.Icon]: ['**/*.svg'],
}

/**
 * 将 Layer 文件挂载到 VFS
 * @param ce CodeEngine上下文
 * @param layers Layer定义列表
 * @param options Layer选项
 */
export async function mountLayerFiles(ce: CodeEngine, layers: CodeEngineLayerDefinition[], options: LayerOptions): Promise<void> {
  // 遍历所有 Layer
  for (const layerDef of layers) {
    // 为每一层创建一个 Scope，使用 Layer 的优先级
    // 注意：Scope 只需要创建一次，但如果 VFS Scope 机制是基于实例的，我们需要确保同一个 Layer 名称对应同一个 Scope 吗？
    // 这里简单起见，我们直接在 mount 时传入 priority，或者使用 scope 方法。
    // 为了方便管理，我们假设 Scope 名字即 Layer 名字 (basename(cwd))
    const layerName = basename(layerDef.cwd)
    const scope = ce.vfs.scope({
      name: layerName,
      priority: layerDef.priority || 0,
    })

    // 并行扫描所有类型的资源
    const scanTypes = Object.keys(defaultPatterns) as ScanTypeEnum[]
    await Promise.all(scanTypes.map(async (type) => {
      const typeConfig = options[type as Exclude<keyof LayerOptions, 'name' | 'enabled'>]
      if (!typeConfig || typeConfig.enabled === false) {
        return
      }

      const dirName = typeConfig.name || type
      const layerDir = resolve(layerDef.cwd, dirName)
      const patterns = typeConfig.pattern || defaultPatterns[type]
      const ignore = typeConfig.ignore || layerDef.ignore || ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts']

      // 扫描文件
      const files = await fg(patterns, {
        cwd: layerDir,
        ignore,
        absolute: false, // 获取相对路径
        onlyFiles: true,
      })

      // 挂载到 VFS
      for (const file of files) {
        if (basename(file).startsWith('_'))
          continue

        const id = resolveLayerId(file, type)
        // 生成虚拟路径: /<typeDir>/<id>.<uid>
        // 为了避免扩展名冲突 (e.g. .ts vs .js), 我们在 VFS 路径中通常不包含原始扩展名?
        // 但是 VFS 需要唯一的 key。如果 key 是 hash(path, priority)，那 path 必须一致。
        // 如果 component A 有 Button.vue (LayerUser) 和 Button.tsx (LayerBase)，
        // 它们的 ID 都是 'BaseButton' (假定)。
        // 如果虚拟路径是 /components/BaseButton，那么它们会冲突，高优先级胜出。这是符合预期的。
        // 问题是：如果虚拟路径没有扩展名，后续处理 (如 import) 会方便吗？
        // 通常 import 需要扩展名或者 loader 处理。
        // 我们可以保留原始扩展名吗？不行，为了冲突，我们需要统一路径。
        // 所以使用 /<dirName>/<id> 作为虚拟路径。
        // 但是为了方便调试和潜在的后缀识别，也许可以加一个统一后缀？
        // 这里暂定：直接使用 ID 构造路径。对于 Component，通常 ID 是 PascalCase。
        // 虚拟路径: /{dirName}/{id} (无后缀)
        // 或者，为了表示这是一个虚拟文件，我们可以加个后缀，比如 .layer
        // 现阶段：直接 mount 到 /{dirName}/{id}

        const virtualPath = join('/', dirName, id)
        const physicalPath = join(layerDir, file)

        // 挂载
        scope.mount(virtualPath, physicalPath, {
          originalPath: file,
          pattern: Array.isArray(patterns) ? patterns[0] : patterns, // 简单记录一下
        })
      }
    }))
  }
}

/**
 * 从 VFS 同步 LayerMap
 * @param ce CodeEngine上下文
 * @param options Layer选项
 */
export async function syncVfsToLayerMap(ce: CodeEngine, options: LayerOptions): Promise<void> {
  const layerMap: Record<ScanTypeEnum, CodeEngineLayer[]> = {
    [ScanTypeEnum.Api]: [],
    [ScanTypeEnum.Component]: [],
    [ScanTypeEnum.Composable]: [],
    [ScanTypeEnum.Layout]: [],
    [ScanTypeEnum.Page]: [],
    [ScanTypeEnum.Store]: [],
    [ScanTypeEnum.Util]: [],
    [ScanTypeEnum.Icon]: [],
  }

  // 为了反向解析 path -> type，我们需要一个 map
  // dirName -> type
  const dirToType: Record<string, ScanTypeEnum> = {}
  for (const type of Object.keys(layerMap) as ScanTypeEnum[]) {
    const typeConfig = options[type as Exclude<keyof LayerOptions, 'name' | 'enabled'>]
    if (typeConfig && typeConfig.enabled !== false) {
      const dirName = typeConfig.name || type
      dirToType[dirName] = type
    }
  }

  // 获取 VFS 中所有文件
  // 这里我们可以优化 glob pattern，或者假设 VFS 里只有 Layer 文件
  // 假设 VFS 目前只用于 Layer。
  const entries = ce.vfs.glob('**/*')

  for (const entry of entries) {
    // entry.path 是虚拟路径，例如 /components/BaseButton
    // 解析第一段作为 dirName
    const parts = entry.path.split('/').filter(Boolean)
    if (parts.length < 2)
      continue // 至少要有 dirName 和 file

    const dirName = parts[0]
    const type = dirToType[dirName]
    if (!type)
      continue

    const id = parts.slice(1).join('/') // 剩余部分作为 id? 原始 id 可能包含 /

    // 从 entry 中恢复信息
    // entry.source 是物理路径
    // entry.layer 是 Scope Name (层名)
    // 我们需要重建 CodeEngineLayer 对象

    // 如果 VFS 记录了 originalPath 最好，否则我们要从 source 反推?
    // VFS mount 时记录了 originalPath 在 options 里，但 VFS interface 似乎没有直接暴露 extra options 到 record?
    // 查看 vfs.ts: record 包含 pattern, originalPath 等及其它字段
    // VFS Record 定义包含 [key: string]: any 吗？
    // let's check schema. VfsRecord has originalPath, pattern.

    // 创建 Item
    const item = createLayerItem(entry, type, id, options)
    if (item) {
      layerMap[type].push(item)
    }
  }

  // 注册数据
  for (const type of Object.keys(layerMap) as ScanTypeEnum[]) {
    useProvide(getLayerKey(type), () => layerMap[type])
  }
}

function createLayerItem(entry: any, type: ScanTypeEnum, id: string, options: LayerOptions): CodeEngineLayer | null {
  if (typeof entry.source !== 'string')
    return null // 必须是物理文件引用

  const absPath = entry.source
  const layerName = entry.scope || 'unknown'
  const priority = entry.priority || 0
  // entry.originalPath 是相对 layer 根目录的路径吗？
  // 在 mountLayerFiles 中: originalPath: file (relative to layerDir)
  // 但 cwd 是 layerDir.
  // 我们需要 layerRoot. entry 不直接存 layerRoot.
  // 但 absPath = join(layerRoot, typeDir, originalPath)
  // 我们可以反推吗？或者 VfsRecord 应该存更多信息？
  // 目前 VfsRecord 有 layer 字段 (scope name).
  // 我们暂时无法直接获取 root。
  // 但是 CodeEngineLayer 需要 root.
  //
  // 解决方案：
  // 1. VFS mount 时把 root 存进去。
  // 2. 或者我们不需要 root? loader 需要 root 和 relative paths.
  //
  // 让我们假设 mount 时把 extra info 存入 record。
  // VfsRecord 类型定义是否允许扩展？
  // 检查 vfs.ts -> VFSImpl update -> existing = ...
  // VFS update accepts VfsRecord which has specific fields.
  // VFS implementation uses `this.files.set(record.path, record)`.
  // If we pass extra props to `mount`'s options, does it get saved?
  // VfsScopeImpl.mount calls vfs.mount with options.
  // VfsImpl.mount calls `this.update({... options... })`.
  // It seems it spreads options into the record?
  // VFS.ts line 72: `originalPath: options?.originalPath`
  // It only explicit picks `originalPath` and `pattern`.
  // It does NOT spread all options.

  // So we are limited to what VfsRecord supports.
  // We can recreate `root` if we know `absPath` and `originalPath` provided `dirName` is static.
  // absPath = root + / + dirName + / + originalPath
  // root = absPath - (dirName + originalPath)

  const typeConfig = options[type as Exclude<keyof LayerOptions, 'name' | 'enabled'>]
  const dirName = typeConfig?.name || type
  const originalPath = entry.originalPath || ''

  // 尝试计算 root
  // absPath: /Users/.../packages/layer-a/components/Button.vue
  // suffix: components/Button.vue
  const suffix = join(dirName, originalPath)
  // 注意 path separator
  const suffixLen = suffix.length
  const root = absPath.endsWith(suffix) ? absPath.slice(0, -suffixLen - 1) : dirname(absPath) // Fallback
  // -1 for separator. Safe enough?

  // 构造 name 对象
  const isFunctional = [
    ScanTypeEnum.Composable,
    ScanTypeEnum.Store,
    ScanTypeEnum.Util,
    ScanTypeEnum.Api,
  ].includes(type)

  const name = isFunctional
    ? {
        origin: '',
        pascal: '',
        lazyPascal: '',
        kebab: '',
        lazyKebab: '',
        safeVar: '',
        safeLazyVar: '',
        chunk: '',
      }
    : {
        origin: basename(originalPath), // 使用原始文件名
        pascal: pascalCase(id),
        lazyPascal: `Lazy${pascalCase(id)}`,
        kebab: kebabCase(id),
        lazyKebab: `lazy-${kebabCase(id)}`,
        safeVar: camelCase(id),
        safeLazyVar: `lazy${camelCase(id)}`,
        chunk: kebabCase(id),
      }

  // 构造 overrides
  // 我们可以通过 inspect 获取历史
  // const inspection = ce.vfs.inspect(entry.path)
  // const history = inspection?.history || []
  // history 包含了被覆盖的记录。
  // 我们需要把 history 转换为 Partial<CodeEngineLayer>
  // 这在 sync 阶段可能比较重，但是是值得的。
  // 但是 ce.vfs.inspect 需要 context 吗？ syncVfsToLayerMap 已经有 frame。
  // 暂时先留空 overrides，或者标记 TODO。
  // 计划中提到：计划保留 overrides 字段，通过 vfs.inspect(path).history 填充。

  const overrides: any[] = []
  // TODO: populate overrides from vfs history

  return {
    meta: {
      layer: layerName,
      priority,
    },
    path: {
      root,
      abs: absPath,
      relative: suffix,
      scan: originalPath,
      alias: 'TODO', // 需要 resolveAlias
      prefetch: 'TODO',
    },
    name,
    config: {
      export: 'default',
      prefetch: false,
      preload: false,
    },
    loader: {
      dynamicImport: () => `() => import('${absPath}')`,
    },
    overrides,
  }
}

/**
 * 资源 ID 生成策略 (Smart Resolution)
 */
export function resolveLayerId(file: string, type: ScanTypeEnum): string {
  const fileName = basename(file, extname(file))
  const dir = dirname(file)

  // 统一处理 index 文件：components/Button/index.tsx -> Button
  const isIndex = fileName === 'index'
  let logicalName = ''

  if (isIndex) {
    // 如果是 index，取目录名。如果是根目录下的 index (dir === '.')，则保留 index 或转为 root?
    // 对于 page: index.vue -> index
    // 对于 component: Button/index.vue -> Button
    logicalName = dir === '.' ? 'index' : basename(dir)
    // 需要回溯完整路径吗？
    // 对于 components/A/B/index.vue -> Component ID 应该是 A/B ? 还是 B ?
    // 通常组件名是 ComponentName。这里假设自动导入只要最后一段，或者路径 PascalCase。
    // 按 Nuxt 习惯：components/base/Button/index.vue -> BaseButton
    // 这里简化处理：如果是 index，取目录路径作为 ID 基础
    const pathParts = dir.split(sep)
    logicalName = pathParts.join('/')
  }
  else {
    // 比如 components/base/Button.vue -> base/Button
    logicalName = dir === '.' ? fileName : join(dir, fileName)
  }

  // 针对不同类型的 ID 格式化
  switch (type) {
    case ScanTypeEnum.Component:
      // components/base/Button.vue -> BaseButton (PascalCase path)
      return pascalCase(logicalName)

    case ScanTypeEnum.Layout:
      // layouts/custom-auth.vue -> custom-auth (KebabCase)
      return kebabCase(logicalName)

    case ScanTypeEnum.Page:
      // pages/user/[id].vue -> user/[id] (保留原始路径结构，去扩展名)
      // 需要把 window separator 统一为 /
      return logicalName.replace(/\\/g, '/')

    case ScanTypeEnum.Composable:
    case ScanTypeEnum.Store:
    case ScanTypeEnum.Util:
    case ScanTypeEnum.Api:
      // composables/useUser.ts -> useUser (CamelCase last part usually, or namespaced?)
      // Nuxt 中 composables 也是 auto import，通常文件名即变量名
      // 如果是 nested/useFoo.ts -> useFoo (通常不带 namespace) 还是 nestedUseFoo?
      // 假设：文件名即 ID (忽略目录，除非 index)
      // V3 计划：文件名 (Filename) 作为 ID
      return isIndex ? camelCase(basename(dir)) : camelCase(fileName)

    case ScanTypeEnum.Icon:
      return kebabCase(logicalName)

    default:
      return logicalName
  }
}
