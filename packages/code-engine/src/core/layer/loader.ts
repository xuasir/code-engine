import type { CodeEngineLayer, CodeEngineLayerDefinition, LayerOptions, ScanConfig } from '@a-sir/code-engine-schema'
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
 * 核心：加载 Layers
 */
export async function loadLayers(layers: CodeEngineLayerDefinition[], options: LayerOptions): Promise<Record<ScanTypeEnum, CodeEngineLayer[]>> {
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

  // 并行扫描所有类型的资源
  await Promise.all(
    (Object.keys(layerMap) as ScanTypeEnum[]).map(async (type) => {
      // 获取该类型的扫描配置 (e.g. { name: 'components', pattern: '**/*.vue' })
      const typeConfig = options[type as Exclude<keyof LayerOptions, 'name' | 'enabled'>]

      if (!typeConfig || typeConfig.enabled === false) {
        return
      }

      // 构造完整配置：类型 + 基础配置
      const scanConfig: ScanConfig = {
        type,
        name: typeConfig.name,
        pattern: typeConfig.pattern || defaultPatterns[type],
        ignore: typeConfig.ignore,
      }

      // 执行扫描与合并
      layerMap[type] = await scanAndMerge(layers, scanConfig)

      // 注册数据
      useProvide(getLayerKey(type), () => layerMap[type])
    }),
  )

  return layerMap
}

/**
 * 扫描并合并 Layers
 * 核心逻辑：
 * 1. 遍历所有 Layers (Base -> User)
 * 2. 针对每个 Layer，扫描指定目录下的文件
 * 3. 生成 ID (resolveLayerId)
 * 4. 存入 Map，后来的覆盖先来的 (Override)
 */
export async function scanAndMerge(layers: CodeEngineLayerDefinition[], config: ScanConfig): Promise<CodeEngineLayer[]> {
  // 1. 并行扫描所有 Layer 的文件
  const scanResults = await Promise.all(layers.map(async (layerDef) => {
    const layerDir = resolve(layerDef.cwd, config.name)
    const files = await fg(config.pattern || '**/*', {
      cwd: layerDir,
      ignore: config.ignore || ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
      absolute: false, // 获取相对路径，方便计算 ID
      onlyFiles: true,
    })
    return { layerDef, layerDir, files }
  }))

  // 2. 按优先级降序排序 (User -> Base)，以便实现对象剪枝
  // 高优先级的先处理，确立主对象；低优先级的后处理，作为 overrides
  scanResults.sort((a, b) => (b.layerDef.priority || 0) - (a.layerDef.priority || 0))

  const itemMap = new Map<string, CodeEngineLayer>()
  const idCache = new Map<string, string>()

  for (const { layerDef, layerDir, files } of scanResults) {
    for (const file of files) {
      if (basename(file).startsWith('_'))
        continue // 忽略 _ 开头

      // 3. ID 计算缓存
      const cacheKey = `${file}:${config.type}`
      let id = idCache.get(cacheKey)
      if (!id) {
        id = resolveLayerId(file, config.type)
        idCache.set(cacheKey, id)
      }

      const absPath = join(layerDir, file)
      const existing = itemMap.get(id)

      if (existing) {
        // 4. 剪枝优化：如果已存在（高优先级已处理），只创建简化的 Override 对象
        // 从而避免了昂贵的 name 变体计算和 loader 定义
        const simplified: Partial<CodeEngineLayer> = {
          meta: {
            layer: basename(layerDef.cwd),
            priority: layerDef.priority || 0,
          },
          path: {
            root: layerDef.cwd,
            abs: absPath,
            relative: join(config.name, file),
            scan: file,
            alias: 'TODO',
            prefetch: 'TODO',
          },
        }

        // 维护 Overrides 顺序：期望是 [Base, Middle, User] (相对于主对象)
        // 由于我们是倒序遍历 (User -> Middle -> Base)
        // 当前遇到的 layer 是更低优先级的，所以应该插到数组头部？
        // 原始逻辑：User.overrides = [Base, Middle].
        // 假设 User 也是完整对象。
        // 原逻辑：
        // 1. Base -> Map(id, Base)
        // 2. Mid -> Map(id, Mid(overrides=[Base]))
        // 3. User -> Map(id, User(overrides=[Base, Mid]))
        // 也就是 overrides 数组里，越早被扫描到的（低优先级）在越前面。
        // 现在倒序：
        // 1. User -> Map(id, User)
        // 2. Mid -> User.overrides.unshift(Mid) -> [Mid]
        // 3. Base -> User.overrides.unshift(Base) -> [Base, Mid]
        // 结果和原子保持一致。
        if (!existing.overrides)
          existing.overrides = []

        existing.overrides.unshift(simplified as any)
      }
      else {
        const isFunctional = [
          ScanTypeEnum.Composable,
          ScanTypeEnum.Store,
          ScanTypeEnum.Util,
          ScanTypeEnum.Api,
        ].includes(config.type)

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
              origin: basename(file),
              pascal: pascalCase(id),
              lazyPascal: `Lazy${pascalCase(id)}`,
              kebab: kebabCase(id),
              lazyKebab: `lazy-${kebabCase(id)}`,
              safeVar: camelCase(id),
              safeLazyVar: `lazy${camelCase(id)}`,
              chunk: kebabCase(id),
            }

        // 5. 创建完整对象 (主对象)
        const newItem: CodeEngineLayer = {
          meta: {
            layer: basename(layerDef.cwd), // 简单取名，也可从 package.json 读取
            priority: layerDef.priority || 0,
          },
          path: {
            root: layerDef.cwd,
            abs: absPath,
            relative: join(config.name, file),
            scan: file,
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
          overrides: [],
        }

        itemMap.set(id, newItem)
      }
    }
  }

  // 返回去重后的列表
  return Array.from(itemMap.values())
}

/**
 * 资源 ID 生成策略 (Smart Resolution)
 */
function resolveLayerId(file: string, type: ScanTypeEnum): string {
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
