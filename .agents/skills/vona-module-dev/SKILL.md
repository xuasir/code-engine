---
name: "vona-module-dev"
description: "指导开发/集成 Vona 模块；当新建/配置/集成/发布模块时调用"
---

# 技能指南（最佳实践）

## 技能目的与适用场景
- 目的：指导在 Vona 中开发、配置、集成与发布模块，确保模块以可预期的生命周期、选项合并与观测能力运行。
- 适用：当需要新增模块能力、扩展 OVFS/Layer、生成类型与资源、或调整模块安装/发现/发布行为时调用。
- 不适用：纯业务功能实现或与模块系统无关的应用逻辑修改。

## 输入与输出
- 输入：模块目标与范围、模块选项（inline 或通过 configKey）、是否唯一加载、预计使用的生命周期钩子。
- 输出：一个可安装的模块（默认导出），具备完整 meta、defaults/schema、hooks 绑定与跳过逻辑；在配置文件中完成模块声明。

## 使用前检查清单
- 明确模块的 name、version、configKey 与是否唯一加载。
- 明确模块的启用条件（可通过 options.enabled 等），返回 false 能安全跳过。
- 明确需要绑定的生命周期钩子（modules:before/done、ready、ovfs:change、close）。
- 明确是否需要扩展配置 Schema 与默认值来源（inline → configKey → defaults → schema）。

## 执行步骤（面向行动）
- 定义模块骨架：使用 defineModule，填写 meta 与 defaults；如需严格校验，提供 schema。
- 条件跳过与唯一加载：在 setup 内根据选项决定是否 return false；避免重复加载。
- 绑定生命周期：在 setup 内注册必要 hooks；将日志输出与观测统一到带 tag 的 logger。
- 集成能力：按需使用 kit 能力（addLayer / addLayers、extendConfigSchema 等）与内部能力（OVFS、Pipeline、DTS 生成）。
- 安装与配置：在 vona.config.* 中完成字符串/元组/函数三种形态的模块声明。
- 自动发现与发布：如果需要被自动发现，遵循包名前缀约定并默认导出模块函数。

## 完成标准与验证
- 默认导出为模块函数（VonaModule），meta 与 configKey 合理明确。
- defaults 与（可选）schema 完整，选项合并顺序符合预期。
- 绑定的 hooks 在预期生命周期内被触发；日志输出可观测。
- 返回 false 时模块被正确跳过；唯一加载生效，不重复安装。
- modules 配置生效（字符串/元组/函数形态均正确解析）。

## 故障排查与恢复
- 未加载：检查唯一加载标记与返回值是否为 false；确认安装入口与导出是否正确。
- 动态导入失败：核对解析路径/后缀与包导出形态（需默认导出模块函数）。
- hooks 未触发：确认绑定时机与生命周期顺序是否正确；检查 modules:done 之后的依赖行为。
- OVFS 为空：确认 Layer 配置与扫描是否已在 modules:done 之后启动。

## 示例（最小可用）
```ts
import type { Vona } from '@vona-js/schema'
import { defineModule, useLogger } from '@vona-js/kit'
export interface FooOptions { enabled?: boolean }

export default defineModule<FooOptions>({
  meta: { name: 'vona:foo', version: '0.0.1', configKey: 'foo' },
  defaults: () => ({ enabled: true }),
  async setup(options, vona: Vona) {
    if (!options.enabled) return false
    const logger = useLogger('vona:foo')
    vona.hook('ready', () => { logger.info('foo ready') })
  },
})
```

## 配置示例
```ts
export default {
  modules: [
    './src/modules/foo',
    ['@vona-js/module-bar', { enabled: true }],
  ],
}
```

# Vona Module 开发剖析

## 阶段 0｜认知与目标
- 目标：明确模块用途、输入选项与挂载的生命周期
- 触发：准备引入新能力或扩展 OVFS/Layer、生成代码、观测等
- 参考：模块生命周期与安装流程
  - 发现与解析：支持字符串入口、[包名, 选项] 元组、函数三种形态；包自动发现遵循模块前缀约定；解析错误时应提示入口与导出形态。
  - 动态导入与安装：采用 ESM 动态导入，要求默认导出为模块函数；安装阶段按模块顺序进行，失败应不中断整体流程并给出诊断。
  - 初始化时机与钩子：核心生命周期包括 modules:before/done、ready、ovfs:change、close；模块应在合适时机注册钩子并保证幂等。

## 阶段 1｜模块骨架与 meta
- 决策点：name、version、configKey 是否明确；是否需要唯一加载（避免重复）
- 行动：以 defineModule 定义模块骨架，设置 meta 与 defaults
- 参考：选项合并与唯一加载
  - 合并策略与 schema 默认值：合并来源顺序为 inline 配置 → 通过 configKey 的配置项 → defaults 默认值 → schema 默认值与校验；冲突时以更近的来源为准。
  - 唯一加载与返回 false：当检测到重复或条件不满足时返回 false 跳过当前模块安装；唯一加载可通过内部标记与条件判断实现。

```ts
import type { Vona } from '@vona-js/schema'
import { defineModule, useLogger } from '@vona-js/kit'
export interface FooOptions { enabled?: boolean }

export default defineModule<FooOptions>({
  meta: { name: 'vona:foo', version: '0.0.1', configKey: 'foo' },
  defaults: () => ({ enabled: true }),
  async setup(options, vona: Vona) {
    if (!options.enabled) return false
    const logger = useLogger('vona:foo')
    vona.hook('ready', () => { logger.info('foo ready') })
  },
})
```

## 阶段 2｜选项合并与 Schema
- 决策点：是否需要 schema 来提供默认值与校验
- 行动：在 defaults 中提供基础默认；如需更严格，提供 schema
- 参考：合并来源与顺序（inline → configKey → defaults → schema）
  - 说明：schema 应定义字段类型、可选性与默认值，并在安装前进行校验与合并；defaults 用于简化常用场景，schema 用于约束边界。

## 阶段 3｜生命周期与 Hook 接入
- 决策点：模块应在哪个时机发挥作用（modules:before/done、ready、ovfs:change、close）
- 行动：在 setup 中绑定 hooks，返回 false 可条件跳过
- 参考：内置模块使用 hooks 的范例
  - 生成类型与资源树：在 modules:done 之后，根据 OVFS 生成资源索引与类型声明；保证增量更新与可重入。
  - Layer 管线启动与订阅：创建并运行 Layer 流水线，订阅变更事件；错误应记录并不中断其他订阅。

## 阶段 4｜module 能力（引用与索引）
- 目的：统一索引 modulekit 能力，供模块开发引用
- 稳定 API（@vona-js/kit）：
  - defineModule：定义模块骨架、合并选项并暴露 setup；支持返回 false 跳过。
  - useLogger：按 tag 输出可观测日志，支持在 debug 模式下扩展细粒度信息。
  - extendConfigSchema：在安装时扩展项目配置的 Schema，以统一校验与默认值。
  - addLayer / addLayers：在安装阶段注册或批量注册 Layer 扩展，供流水线使用。
- 内部 API（@vona-js/kit/internal）：
  - createPipeline：构建并运行 Layer 流水线，支持订阅与错误隔离。
  - createOVFS：创建资源虚拟文件系统，用于统一管理布局、组件、页面、组合式函数等。
  - generateDTS：基于 OVFS 生成类型声明，支持增量更新。
- 相关协作：
  - OVFS 类型：layouts、components、pages、composables、apis、icons、store、utils、styles、plugins。
  - Layer 启动时机与订阅：在 modules:done 之后启动，订阅变更并触发相应处理；保持去抖与性能控制。
  - debounce：工具函数，用于事件去抖与减少重复工作。

## 阶段 5｜安装与配置形态
- 决策点：模块以字符串、元组或函数形态集成
- 行动：在 vona.config.* 中配置 modules
```ts
export default {
  modules: [
    './src/modules/foo',                       // 字符串解析入口（支持后缀/扩展名）
    ['@vona-js/module-bar', { enabled: true }], // 元组传参
  ],
}
```
- 参考：解析规则与后缀
  - 说明：字符串入口支持相对路径与后缀解析；元组形态可传递选项；函数形态可直接返回模块定义。

## 阶段 6｜自动发现与发布约定
- 决策点：是否需要被依赖自动发现
- 行动：遵循包名前缀 `/^@vona-js\/module-|^vona-js-module-/`，导出默认的模块函数
- 参考：依赖前缀匹配与合并来源
  - 说明：符合前缀约定的依赖在安装时会被自动发现并合并；如需关闭自动发现，应在配置中显式控制。

## 阶段 7｜验证与观测
- 清单：
  - 默认导出为模块函数（VonaModule）
  - meta.name 与 configKey 合理
  - defaults 与（可选）schema 完整
  - hooks 在预期生命周期被触发
  - 返回 false 能正确跳过
  - modules 配置生效（字符串/元组/函数）
- 观测：打开 debug 或使用带 tag 的 logger（如 useLogger('vona:foo')）
  - 说明：日志需包含模块名、生命周期阶段与关键事件；在非 debug 模式下保持必要信息与低噪声。

## 阶段 8｜常见故障排查
- 模块未加载：检查唯一加载标记与返回值是否 false（条件跳过）
  - 说明：确认安装入口有效、条件判断正确、未重复安装；记录跳过原因便于定位。
- 动态导入失败：确认路径与扩展名、包是否导出默认函数
  - 说明：确保入口可解析、包为 ESM 并默认导出模块函数；失败应给予清晰错误信息。
- hooks 未触发：检查绑定时机（modules:done、ready、ovfs:change、close）
- OVFS 内容为空：确认 Layer 配置与扫描是否启动（在 modules:done 之后）

## 安全边界与反模式
- 安全：不要记录或输出敏感信息；日志与配置需去除密钥与令牌；避免引入未使用依赖与增加包体积。
- 幂等：hooks 注册与流水线启动需具备幂等性；重复触发不应造成状态异常。
- 反模式：在 setup 中直接执行耗时阻塞任务；随意改变全局配置；忽略错误与不提供恢复策略。
