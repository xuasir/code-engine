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
    ready(vona) {
      const logger = useLogger('my-module')
      logger.info('my-module ready')
    },
  },
  setup(options, vona) {
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
