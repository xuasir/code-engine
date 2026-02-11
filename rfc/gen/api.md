# Module Kit API 设计文档（Host + IR + Slot）

## 实现状态（2026-02）
- public：`createArtifactsBuilder`、`SlotPresets`
- internal：`createArtifactsRuntime`、`snapshotArtifactsRegistry`、`clearArtifactsRegistry`
- 旧 `createGenerateBuilder` / `defineGenerateUnit` / `registerGenerateHost` 已移除

## 背景与目标
- 聚焦“多 module 扁平化注册”的生成任务（生成/复制/插槽注入）。
- 以 Host 为最小可观测单元；每个 Host 拥有独立的语义仓库（IR）与 Slot 渲染口。
- 保证增量、确定性与高性能（稳定排序、去重、watch 失效重算）。
- 易用：用户“声明要生成什么”，而非“写路由如何执行”。

## 核心概念
- Host：一个输出目标（文件或目录），拥有 format、observe、watch 等策略，且一次仅选择一种生成模式。
- IR（Host 私有）：模块向 host.ir() 贡献结构化语义数据（imports/decls/registry/snippet 等），延后到 Slot 统一决策渲染。
- Slot：Host 的渲染口，内聚“投放规则”。通过 SlotSpec 定义 inputs、accepts、map/sort/dedupe/render。
- SlotItem：统一输入单元，包含 kind、data、from、stage/order、key 等，确保可去重与稳定排序。
- Watch：Host 的动态依赖订阅，仅用于 dev/watch 场景的失效重算，默认只让当前 Host 失效。

## 观察与事件
- ObserveOptions：可在 ArtifactsBuilder.observe 或 host.observe 设置。
  - manifest：记录每个输出的来源、hash、大小等。
  - explain：输出 explain(host|path) 的详细归因。
  - diff：输出 diff（基于 plan 前后内容比较）。
  - emitEvents：是否发送事件（用于日志/调试面板/IDE）。
  - debugComments：在输出中注入 debug 注释（建议仅 dev）。
- ArtifactEvents：规划/写入/跳过/移除/冲突/错误等事件回调，用于日志与调试面板。
  - 例如 onPlanned(planHash/changed)、onEmitted(bytes)、onSkipped(reason)、onRemoved(path)、onConflict(reason)、onError(error)。

## Host 模式
- text：生成单文件文本；content 可为字符串或 lazy 函数；支持 encoding/eol/hashInputs。
- copyFile：复制单文件；可选 transform(input, ctx) 做二进制级变换。
- copyDir：复制目录；支持 filter/ignore/mapPath。
- slots：模板驱动，slots 定义输入/校验/渲染；支持 directContributions 直接注入；marker 可配置注入占位符模式。

### Marker 与占位符
- marker.mode：'auto' | 'ts-comment' | 'html-comment'
  - auto：根据 HostKind 自动选择注释占位符语法。
  - ts-comment：以 `// @vona:slot slotName` 或 `/* @vona:slot slotName */` 作为占位。
  - html-comment：以 `<!-- @vona:slot slotName -->` 作为占位。
- onMissingMarker：'error' | 'ignore'
  - error：模板中缺失对应占位符时抛错。
  - ignore：忽略缺失，占位符不渲染。
- 示例：在模板中书写 `/* @vona:slot imports */`，Slot 渲染后将替换该标记。

### HostKind
- 'ts' | 'dts' | 'tsx' | 'js' | 'jsx' | 'vue' | 'json' | 'css' | 'text' | 'binary' | 'unknown'

### 策略枚举
- ConflictPolicy：'error' | 'overwrite' | 'skipIfExists'
- CleanupPolicy：'keep' | 'remove-orphans'
- FormatTool：'prettier' | 'biome' | 'none' | 自定义字符串

## Slot 设计
- SlotInput：从 IRChannel 映射至 SlotItem；支持 where/map/kind/key/stage/order/sourceModule/inputId。
- SlotSpec：accepts 强校验；map/sort/dedupe 作用于最终合并后的 items；render(items, ctx) 必须确定性且建议以换行结尾。
- SlotPreset/SlotSpecPatch：preset 作为“基类”，通过 patch 增量修改（addInputs/replaceInputs、函数式 accepts）。
- 官方数据类型：
  - ImportItem：sideEffect/default/namespace/named（支持 typeOnly）。
  - DeclItem：type/interface/const/fn。
  - RegistryEntry：route/component/store/icon。
  - SnippetData：{ lang, code }。
- 官方 SlotPresets：imports/decls/registry/snippet。

### DirectContributions（直接注入）
- 通过 slots.add/SlotsHostBuilder.add(slot, item, { when }) 直接把 SlotItem 注入到指定 slot。
- 适用于无需 IR 的少量补充内容（例如临时代码片段或声明）。
- when 可记录触发条件，用于 explain/manifest。

### accepts/sort/dedupe 默认与错误
- accepts：强校验，若 item.kind 不在列表内，抛错并包含 slotName/inputId/from.module 信息。
- 默认稳定排序：stage → order → kind → key → from.module。
- 默认去重：按 key 去重；若缺失 key，建议在 map 阶段补齐或在 dedupe 自定义处理。

## 增量与性能
- planHash 建议由 templateHash + 每个 slotBucketItems 的稳定哈希 + host 选项组成。
- slotBucketItems 稳定哈希包含 kind/key/stage/order + data 的稳定序列化 + from.module。
- watch 触发时仅重算失效 Host。
- 默认稳定排序与去重：
  - 排序维度：stage → order → kind → key → from.module，确保并发贡献的确定性。
  - 去重基于 key；snippet/custom 类强烈建议提供 key。

## Builder API（最终版）
- ArtifactsBuilder
  - root(path) 设置管理根目录。
  - format(toolOrEnabled, options) 配置格式化。
  - observe(options, events) 开启可观测与事件。
  - policy(policy) 配置清理/冲突/并发/干跑等策略。
  - host(filePath) 进入 HostBuilder；`hostId` 由内部基于 `filePath` 自动生成。
  - createArtifactsBuilder 支持泛型，`filePathScope` 可推导 `host(filePath)` 的字面量提示。
  - dir(path) 进入命名空间糖。
  - plan()/commit() 执行规划与落盘；explain(hostIdOrPath)/diff() 输出归因与差异。
- HostBuilder（状态机）
  - 选择模式后锁定：text/copyFile/copyDir/slots 只能选其一。
  - kind/ts/dts/vue/format/observe/tags/allowExternal/conflict。
  - at(path) 仅用于兼容旧写法；推荐直接使用 host(filePath)。
  - watch(dep)/watchBy(id, subscribe) 注册动态依赖。
  - text()/copyFile()/copyDir()/slots() 转入对应子 builder。
  - ir() 访问 Host 私有 IR；end() 返回 ArtifactsBuilder。
- TextHostBuilder：content/encoding/eol/hashInputs/end。
- CopyFileHostBuilder：from/transform/end。
- CopyDirHostBuilder：from/filter/ignore/mapPath/end。
- SlotsHostBuilder：template/slot(name)/usePreset(name, preset)/add(slot, item)/detectSlots?/end。
- SlotDefineBuilder：preset/use(spec)/extend(patch)/inputFrom(channel, { inputId })/end。
- SlotInputBuilder：where/map/kind/key/stage/order/sourceModule/end。
- HostIRBuilder：toHost(hostIdOrPath)/push(channel, item)/end。
- DirBuilder：host(relPath)/file(relPath)/end。

### Watch 订阅与失效
- HostWatchDependency：{ id, subscribe(emit) }，返回 disposer 或函数用于 teardown。
- InvalidationEmitter.emit(key)：触发当前 Host 的失效重算（dev/watch 场景），key 仅用于 explain/debug。
- 幂等性：disposer 多次调用不应崩溃。
- build/CI 默认不启用 watch，减少开销。

### IR 仓库与跨 Host 贡献
- HostIRStore：push/read/channels，Host 私有，不维护全局 IR。
- HostIRBuilder.toHost(hostIdOrPath)：将当前模块的贡献写入到其他 Host 的 IR 仓库（跨 Host 投放，但仍是目标 Host 私有）。
- 建议使用结构化数据（如 ImportItem/DeclItem/RegistryEntry），提升合并稳定性。

## 上下文与渲染
- RenderCtx：包含 hostId/hostPath/kind、format、observe、env 以及 utils（normalizeEol/indent）。
- InputCtx：包含 hostId/env，用于 inputs 的 where/map。

### RenderCtx 细节
- hostId/hostPath/kind：当前 Host 的标识、目标路径与类型。
- format：{ enabled, tool, options } 控制格式化工具与参数。
- observe：沿用 ObserveOptions。
- env：渲染时的环境上下文（例如版本号、开关位）。
- utils：
  - normalizeEol(s, eol)：统一换行符为 lf/crlf。
  - indent(s, spaces)：以空格进行缩进。

### 格式化与换行
- format.enabled/tool/options：控制是否在 commit 后对变更文件进行格式化。
- 建议 render(items) 产物以 '\n' 结尾，减少 diff 噪音。
- eol(lf/crlf) 配合 normalizeEol 保持跨平台一致性。

## 策略与结果结构
- ArtifactsPolicy：managedRoot/allowOutsideRoot/cleanup/conflict/concurrency/dryRun。
- PlanResult：每个 host 的 path/kind/planHash/changed。
- CommitResult：emitted/skipped/removed。
- ExplainResult：hostId/path/mode/watches/slots（含 items 的 kind/key/from/stage/order/inputId）。
- DiffResult：files(path/hostId/changed/summary)。

### ArtifactsPolicy 字段
- managedRoot：管理输出的根目录。
- allowOutsideRoot：是否允许输出到根外。
- cleanup：清理策略，是否移除孤儿文件。
- conflict：冲突策略（存在同名文件时）。
- concurrency：并发度。
- dryRun：干跑模式，不实际落盘。

### ExplainResult/PlanResult/CommitResult/DiffResult 语义
- PlanResult：展示各 Host 的计划 hash 与是否变更。
- CommitResult：列出实际写入/跳过/被移除的文件。
- ExplainResult：解释输出的来源（slot/items/watches）。
- DiffResult：给出变更文件与摘要。

## 设计原则
- 结构化优先：IR/SlotItem 用结构体而非字符串，提升可去重/排序/渲染的可靠性。
- 确定性优先：提供默认稳定排序与严格 accepts 校验，避免输出抖动。
- 增量优先：planHash 与 watch 精细失效，避免全量重算。
- 单一职责：Host 持有唯一模式，IR 均为 Host 私有；不做全局 IR。

## 最小使用示例

```ts
// 概念性示例（省略具体类型导入与实现）
const builder = createBuilder()
  .root('dist')
  .format('prettier')
  .observe({ manifest: true, explain: true }, {
    onPlanned(e) { /* ... */ },
  })
  .policy({ cleanup: 'remove-orphans', conflict: 'overwrite' })

// 1) 声明一个 TS 文件 Host，采用 slots 模式
builder.host('src/app.ts')
  .ts()
  .slots()
  .template(`/* @vona:slot imports */\n\nexport function main() {}\n`)
  .slot('imports')
  .preset(importsPreset())
  .end()
  .end()
  .ir()
  .push('imports', { type: 'named', from: 'vue', names: ['ref'] })
  .end()
  .end()

// 2) 规划与提交
await builder.plan()
await builder.commit()
```

## 复制模式示例
- copyFile：
  - from：源文件路径。
  - transform(input, ctx)：二进制变换，例如注入版权头或最简压缩。
- copyDir：
  - from：源目录。
  - filter/ignore：glob 字符串或数组，控制包含与排除。
  - mapPath(relPath)：重写目标相对路径（例如添加前缀或改扩展名）。

## Preset 与工厂
- SlotPreset：{ name, spec, factory? }
- SlotItemFactory：简化构造统一 kind 的 SlotItem，避免重复填写 from/stage/order 等样板。
- 使用建议：preset 仅作为“基类”，通过 extend(patch) 增量修改；避免 replaceInputs 破坏默认输入。

## 与项目集成建议
- 将 Module Kit 作为生成器层，在 packages/* 的构建前置阶段产出统一代码骨架或资源清单。
- 结合观察事件接入 IDE 面板或日志系统，构建“解释型生成”体验。
- 使用 SlotPresets 提供的规范类型（imports/decls/registry/snippet）快速实现高质量 slots。

## 错误与异常语义
- accepts 校验失败：当 item.kind 不在 slot 的 accepts 中时，抛出错误，包含 slot 名称、inputId、from.module 用于定位。
- 缺失占位符：onMissingMarker='error' 时，模板中找不到对应占位符将抛错；'ignore' 时跳过渲染。
- 冲突策略：
  - error：目标路径存在时抛错。
  - overwrite：直接覆盖。
  - skipIfExists：跳过写入，记录 skipped 原因为 'policy'。
- 去重键缺失：默认按 key 去重，若 key 缺失，建议在 map 阶段补齐；也可通过自定义 dedupe 覆盖行为。
- 格式化失败：onError 回调接收 error，commit 阶段不中断其他文件的写入（实现可选）。

## 事件语义与流程
- 规划阶段：onPlanned({ hostId, path, planHash, changed })
- 提交阶段：
  - 写入：onEmitted({ hostId, path, bytes })
  - 跳过：onSkipped({ hostId, path, reason: 'unchanged' | 'policy' })
  - 移除：onRemoved({ path })
  - 冲突：onConflict({ hostId, path, reason })
  - 错误：onError({ hostId?, path?, error })

## Explain 示例

```json
{
  "hostId": "path:src/app.ts",
  "path": "src/app.ts",
  "mode": "slots",
  "watches": [{ "id": "fs:src" }],
  "slots": [{
    "slot": "imports",
    "accepts": ["import"],
    "items": [{
      "kind": "import",
      "key": "vue:ref",
      "from": { "module": "modA" },
      "stage": "normal",
      "order": 0,
      "inputId": "imports-default"
    }]
  }]
}
```

## Diff 示例

```json
{
  "files": [
    { "path": "src/app.ts", "changed": true, "summary": "imports updated" },
    { "path": "assets/logo.svg", "changed": false }
  ]
}
```

## Preset 输出示例

### imports
- 输入：
  - { type: "named", from: "vue", names: ["ref", "reactive"] }
  - { type: "default", from: "./App", name: "App" }
  - { type: "sideEffect", from: "./polyfill" }
- 渲染：
```ts
import { reactive, ref } from 'vue'
import App from './App'
import './polyfill'
```

### decls
- 输入：
  - { type: "interface", name: "Config", code: "interface Config { mode: string }" }
  - { type: "const", name: "VERSION", code: "export const VERSION = '1.0.0'" }
- 渲染：
```ts
interface Config { mode: string }
export const VERSION = '1.0.0'
```

### registry
- 输入：
  - { type: "route", key: "home", path: "/", component: "HomeView" }
  - { type: "route", key: "about", path: "/about", component: "AboutView" }
- 渲染：
```ts
export const routes = [
  { path: '/', component: HomeView },
  { path: '/about', component: AboutView }
]
```

### snippet
- 输入：
  - { lang: "ts", code: "export function main() { return 1 }" }
- 渲染：
```ts
export function main() {
  return 1
}
```

## Watch 示例

```ts
builder.host('src/watch.txt')
  .text()
  .content(() => 'content')
  .end()
  .watchBy('fs:src', (emit) => {
    const stop = fsWatch('src', () => emit.emit('fs:src'))
    return { dispose: () => stop() }
  })
  .end()
```

## 编写规范与检查清单
- SlotSpec 的 accepts 应覆盖所有可能的 item.kind。
- inputs 的 map 返回结构化 SlotItem，避免直接字符串。
- 统一提供 key，用于去重与 explain。
- render 输出以换行结束；normalizeEol 保持一致性。
- 使用 policy.cleanup='remove-orphans' 管理孤儿文件。
- explain/diff 集成到调试面板，保障“可解释生成”体验。

## 模板占位符语法详解
- ts-comment 占位：`// @vona:slot slotName` 或 `/* @vona:slot slotName */`
- html-comment 占位：`<!-- @vona:slot slotName -->`
- auto 模式：根据 HostKind 推断（ts/js/json/css 使用 ts-comment；vue/html 使用 html-comment；文本类按 ts-comment）。
- 替换流程：
  - 收集 slotBucketItems（direct + inputs 合并、accepts 校验、默认排序、默认去重、map 二次变换）。
  - 调用 render(items, ctx) 产出 slotText（建议以换行结束）。
  - 定位模板中的占位符并替换为 slotText；若 onMissingMarker='error' 且未找到，占位符报错。
  - 对最终文本执行 normalizeEol，提交前根据 format.enabled/tool 格式化（仅变更文件）。

## 稳定排序与去重算法规范
- 排序维度与顺序：stage → order → kind → key → from.module
- stage：'pre' < 'normal' < 'post'
- order：升序，缺省视为 0
- kind/key：字典序；缺省 key 排在提供 key 的后面
- from.module：字典序，作为末位 tie-break
- 去重：
  - 基于 key 的稳定去重，保留首个出现的 item。
  - 若缺失 key：建议在 map 阶段补齐；如无法补齐，可在 dedupe 中自定义策略（例如按 data 的稳定序列化哈希去重）。

## IR 稳定序列化与 planHash
- 建议的稳定序列化规则：
  - 对对象键采用字典序排序；对数组按排序后的元素进行稳定化表示。
  - 仅包含渲染相关字段（例如 kind/key/stage/order/data/from.module）。
  - 忽略随机/时序性字段（如时间戳）。
- planHash 组成：
  - templateHash（模板内容哈希）
  - 对每个 slot 的 items 稳定哈希（排序后）
  - host 选项（format/observe/policy 的关键位）
- 目的：保证并发与注册顺序变化不会导致 hash 抖动。

## 冲突/清理策略矩阵
- 冲突（目标路径已存在）：
  - error：抛错并中断该文件的写入。
  - overwrite：覆盖并触发 onEmitted。
  - skipIfExists：跳过并触发 onSkipped(reason='policy')。
- 清理（orphan 文件）：
  - keep：保留所有非本次计划产物。
  - remove-orphans：移除不在本次计划中的旧产物，触发 onRemoved。

## SlotPreset Patch 示例

```ts
builder.host('src/example.ts')
  .ts()
  .slots()
  .template(`/* @vona:slot imports */\n/* @vona:slot decls */\n`)
  .slot('imports')
  .preset(importsPreset())
  .extend({
    addInputs: [{
      from: 'imports-extra',
      map: it => ({ kind: 'import', data: it, from: { module: 'extra' }, key: `extra:${it.from}` })
    }],
    accepts: (prev = []) => Array.from(new Set([...prev, 'import']))
  })
  .end()
  .slot('decls')
  .preset(declsPreset())
  .extend({
    dedupe: (items) => {
      const seen = new Set<string>()
      return items.filter((i) => {
        const k = i.key ?? i.data?.name
        if (!k || seen.has(k))
          return false
        seen.add(k)
        return true
      })
    }
  })
  .end()
  .end()
  .ir()
  .push('imports', { type: 'named', from: 'vue', names: ['ref'] })
  .push('decls', { type: 'const', name: 'FLAG', code: 'export const FLAG = true' })
  .end()
  .end()
```

## Explain/Diff 复合示例

```json
{
  "hostId": "path:src/example.ts",
  "path": "src/example.ts",
  "mode": "slots",
  "watches": [{ "id": "fs:src" }],
  "slots": [
    {
      "slot": "imports",
      "accepts": ["import"],
      "items": [
        { "kind": "import", "key": "vue:named:ref", "from": { "module": "modA" }, "stage": "normal", "order": 0 }
      ]
    },
    {
      "slot": "decls",
      "accepts": ["type", "interface", "const", "fn"],
      "items": [
        { "kind": "const", "key": "FLAG", "from": { "module": "modA" }, "stage": "normal", "order": 0 }
      ]
    }
  ]
}
```

```json
{
  "files": [
    { "path": "src/example.ts", "hostId": "path:src/example.ts", "changed": true, "summary": "imports + decls updated" }
  ]
}
```

## 术语表（Glossary）
- Host：最小可观测单元，代表一个输出目标。
- IR：Host 私有的语义仓库（imports/decls/registry/snippet 等）。
- Slot：渲染口，负责从 IR 投放、合并与渲染。
- SlotItem：投放与渲染的统一输入单元。
- Preset：Slot 的规范化配置基类。
- Patch：对 preset 的增量修改。
- Plan：规划阶段得出的结果，包含 planHash 与 changed。

## 实施 checklist
- 确认模板含所有必要占位符；缺失时设定 onMissingMarker 的期望行为。
- 为每类 item 设定 accepts；在 inputs.map 中补齐 kind/key/stage/order。
- 渲染产物统一换行，启用 normalizeEol；必要时启用 format。
- 配置 policy.cleanup='remove-orphans' 并检查 onRemoved 事件输出。
- 编写 watch 订阅，并确保 disposer 幂等；仅 dev/watch 启用。
