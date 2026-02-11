# @vona-js/kit

面向模块开发者的 API 集合，提供模块定义、Layer 管理、配置扩展与上下文工具。

## 安装

```bash
pnpm add @vona-js/kit
```

## 使用

定义模块与注册 Layer：

```ts
import { addLayer, defineModule, extendConfigSchema, useLogger } from '@vona-js/kit'

export default defineModule<{ enabled: boolean }>({
  meta: { name: 'my-module', version: '0.0.1' },
  defaults: { enabled: true },
  schema: { enabled: true },
  hooks: {
    ready() {
      const logger = useLogger('my-module')
      logger.info('my-module ready')
    },
  },
  setup() {
    addLayer({
      id: 'my-layer',
      source: { type: 'local', root: 'layer' },
      priority: 50,
    })
    extendConfigSchema({ my: { feature: { $default: true } } })
  },
})
```

Internal API（不稳定，供内核集成）：

```ts
import { createLayerRuntime, createOVFS } from '@vona-js/kit/internal'
```

## 生成器 API（Host + IR + Slot）

导出：

- `createArtifactsBuilder`
- `SlotPresets`（`imports` / `decls` / `registry` / `snippet`）

### 快速开始

```ts
import { createArtifactsBuilder, SlotPresets } from '@vona-js/kit'

const artifacts = createArtifactsBuilder({ owner: 'example-module' })

artifacts.host('generated/entry.ts')
  .ts()
  .slots()
  .template('/* @vona:slot imports */\n/* @vona:slot body */\n')
  .usePreset('imports', SlotPresets.imports())
  .usePreset('body', SlotPresets.snippet())
  .add('body', {
    kind: 'snippet',
    data: { lang: 'ts', code: 'export const ok = true' },
    from: { module: 'example-module' },
    key: 'entry:body',
  })
  .end()
  .end()
```

### Watch 与跨 Host IR

```ts
artifacts.host('generated/source.ts')
  .watchBy('source:watch', emit => watcher.subscribe(() => emit.emit('source:changed')))
  .text()
  .content(() => 'export const source = true')
  .end()
  .ir()
  .toHost('generated/entry.ts')
  .push('imports', { type: 'named', from: 'vue', names: ['ref'] })
  .end()
  .end()
```

### filePathScope 类型提示

```ts
const scope = ['types.d.ts', 'manifest.json'] as const

const debugArtifacts = createArtifactsBuilder({
  owner: 'example-module',
  filePathScope: scope,
})

// host 参数会被推断为: 'types.d.ts' | 'manifest.json'
debugArtifacts.host('types.d.ts').text().content('...').end().end()

// 也支持显式泛型
const debugArtifacts2 = createArtifactsBuilder<typeof scope>({
  owner: 'example-module',
  filePathScope: scope,
})
```

### 运行时（internal）

```ts
import { createArtifactsRuntime, snapshotArtifactsRegistry } from '@vona-js/kit/internal'

const runtime = createArtifactsRuntime({
  outputDir: '.vona',
  mode: 'disk',
  registry: () => snapshotArtifactsRegistry(vona),
})

await runtime.start()
```

## 开发与测试

- 构建：`pnpm build`
- 测试：在仓库根目录执行 `pnpm test`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`

## 构建与发布

- 使用 tsdown 构建：`pnpm build`
- 通过工作区统一发布：在仓库根目录执行 `pnpm release`

## 文档

- 开发指南：[kit.md](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/kit.md)
