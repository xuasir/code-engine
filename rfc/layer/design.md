# Vona 层定义、扫描、合并与 OVFS 设计说明

# 概览

- 将应用拆分为多层（核心层、用户层、公共层等），每层提供自身资源（components/pages/layouts/composables/apis/icons/store/utils/styles/plugins）。
- 通过扫描规则生成 LayerAsset，依据优先级与注册序合并到 OVFS（Overlay Virtual File System）。
- OVFS 提供查询、订阅、清理、统计与资源清单输出；生成类型声明文件以支持 IDE 体验。
- 动态层使用文件监控进行增量更新，事件经过 LayerRuntime 归并后批量写入 OVFS。

以下内容以当前实现为准进行校准。

层定义与配置
- 层来源支持本地与远程，本地可设置 dynamic；远程以缓存目录物化为只读本地层。
- LayerMeta 支持内置控制字段：__order（注册序），__origin（user|module），__scanPolicy（user|standard）。
- 资源扫描配置采用标准默认值（LayerStandardResourceConfig），且按层的 __scanPolicy 决定使用用户配置或标准配置。

```ts
import type { ResourceType } from '@vona-js/schema'

export type ResourceType
  = | 'layouts' | 'components' | 'pages'
    | 'composables' | 'apis' | 'icons'
    | 'store' | 'utils' | 'styles' | 'plugins'

export interface ResourceScanConfig {
  enabled: boolean
  name: string
  pattern: string[]
  ignore?: string[]
}

export type LayerSource
  = | { type: 'local', root: string, dynamic?: boolean }
    | { type: 'remote', root: string, dynamic?: false, version?: string }

export interface LayerMeta {
  __order?: number
  __origin?: 'user' | 'module'
  __scanPolicy?: 'user' | 'standard'
}

export interface LayerDef {
  id: string
  source: LayerSource
  priority: number
  ignore?: string[]
  meta?: LayerMeta
}

export interface LayerConfig {
  enabled: boolean
  defs: LayerDef[]
  remote?: {
    cacheDir?: string
    preferCache?: boolean
  }
  config?: Partial<Record<ResourceType, ResourceScanConfig>>
}
```

远程层支持
- 物化策略：preferCache=true 且缓存存在时，将远程层物化为本地只读层；否则跳过并输出告警。
- 缓存位置：默认 .vona/layers，命名通过 remote 包名安全化拼接。
- 版本字段 version 目前仅作为占位，尚未实现自动拉取与版本比对。

层扫描策略
- 工具链：使用 fast-glob 扫描、micromatch 做匹配判断，忽略 BASE_RESOURCE_IGNORE、层级 ignore 与配置 ignore。
- 键生成：统一为 <type>/<keyName>。components/layouts/icons 使用 PascalCase；pages 保持路径式；扁平类型（composables/apis/plugins/store/utils）限制为单段名称。
- 名称信息：对每个资产生成 kebab/pascal/var 及 lazy* 变体名称，仅作为命名派生，并不自动启用懒加载。

资源类扫描（components/layouts/composables/apis/icons/store/utils/styles/plugins）
- 根目录：layer.root + scanConfig.name。
- 模式：pattern 与 ignore 组合过滤，仅匹配文件。
- 规范化：去除扩展名与末尾 index，生成 keyName；扁平类型不允许包含子路径。
- 资产构建：填充 id、type、key、meta（layerId/priority/layerOrder/scanKey）、path、name、loader（dynamicImport 返回相对路径），config（export: 'default'）。

文件路由扫描（pages）
- 片段语法：
  - 静态段：a → /a，权重 3
  - 动态段：[id] → /:id，权重 2
  - 可选段：[[id]] → /:id?，权重 1
  - 捕获段：[...rest] → /:rest(.*)*，权重 0
  - 分组段：(admin) 被忽略，仅用于分组结构
- 路由分数：按 4 进制聚合各段权重，越大越具体。资产中记录 route.path 与 route.score，供上层排序策略使用。

LayerAsset 结构
```ts
export interface LayerAsset {
  id: string
  type: ResourceType
  key: string
  meta: {
    layerId: string
    priority: number
    layerOrder: number
    scanKey: string
    routePath?: string
    routeScore?: number
  }
  path: { root: string, abs: string, relative: string, scan: string }
  name: { origin: string, kebab: string, pascal: string, lazyKebab: string, lazyPascal: string, var: string, safeVar: string, safeLazyVar: string, chunk: string }
  config: { export: 'default' | 'named', prefetch?: boolean, preload?: boolean }
  loader: { relative: string, importName?: string, dynamicImport: () => string }
  route?: { path: string, score: number }
  overrides?: Partial<LayerAsset>[]
}
```

动态监听与增量
- 动态层：local + dynamic=true 将被视为动态层。
- 监控：每个资源类别分别创建 chokidar watcher；资源限制错误（EMFILE/ENOSPC）自动降级为轮询模式。
- 批处理：文件事件入队，微任务批量处理；对单文件执行 scanSingleFile 并生成对应移除/新增 mutations。
- 事件：add/change/unlink 归并为 LayerMutation，LayerRuntime 归一化为 OVFSMutation（reason: add/change/unlink/manual）。

合并策略（OVFS）
- 路径栈：每个 key 维护 LayerAsset 栈，按 priority 降序、layerOrder 升序、id 字典序排序。
- 优胜者：栈首为当前胜出资产，并携带 overrides（其余层的最小快照）。
- 查询索引：为路径维护按 id 的索引，栈超过阈值后构建索引以提升删除/更新效率。
- 变更事件：mutate 批量应用后生成 OVFSResourceChange（add/change/unlink），可订阅回调进行后续处理。
- 清单输出：toManifest 汇总 winners，并按各资源 key 排序；stats 提供按类型计数与总数。

类型生成与输出
- 模块：vona:generate 在 prepare 命令下启用，监听 OVFS 变化。
- 类型文件：输出至 .vona/types.d.ts，声明模块：
  - declare module 'vona:*' 将全部类型聚合导出为 'vona:types'
  - declare module 'vona:types' 中包含 Components/Pages/Layouts 接口
- 生成规则：
  - Components/Layouts：使用默认导出类型
  - Pages：按 route.path 生成映射
  - Composables/APIs：需在资产上设置 loader.importName 后才会生成命名导出类型（当前未自动设置）
- 资源树：打印 OVFS 资源树与层信息，便于调试。

当前限制与未实现项
- 未提供 bundler 虚拟模块（如 #vona/pages）；不包含自动导入与路由表生成逻辑。
- 远程层不包含自动拉取与版本比对，仅支持缓存物化与缺失告警。
- Composables/APIs 的类型生成需后续阶段注入 importName。

配置扩展性
- 标准扫描配置提供各资源默认模式，用户可通过 LayerConfig.config 覆盖；层级以 __scanPolicy 控制是否采用用户配置。
- 可新增资源类型并在标准配置与扫描逻辑中扩展。

性能与一致性
- LayerRuntime 对增量变更使用微批延迟（默认 10ms），hydrate 阶段分块写入 OVFS（默认 5000 条）。
- OVFS 为路径维护索引并缓存按类型的排序列表，变更后自动清理缓存。
- 提供一致性测试以确保随机 mutation 序列下行为稳定。

错误处理与日志
- 远程层缓存缺失时输出告警并跳过注册。
- 重复层 id 会抛出错误。
- watcher 资源限制自动降级为轮询并输出提示。

示例
- 插件层叠覆盖：
  - layer1: plugins/a.ts, plugins/b/index.ts
  - layer2: plugins/c.ts, plugins/b.ts
  - 结果：plugins/b 的胜出资产来自 layer2，删除后自动回退到 layer1 的 index.ts。
- pages 路由片段：
  - pages/users/[id].vue → /users/:id，score 较高
  - pages/users/create.vue → /users/create，静态更具体，应优先于动态
  - pages/(admin)/dashboard.vue → /dashboard（忽略分组段）

总结
- 以上内容已与当前实现对齐：层注册策略、扫描规则、OVFS 合并与事件、类型输出与调试能力均以代码为准。
- 后续集成（虚拟模块、自动导入、路由构建等）可在独立模块中推进，与 OVFS 产物解耦。
