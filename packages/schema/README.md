# @vona-js/schema

提供代码引擎的核心类型与默认配置 Schema。

## 安装

```bash
pnpm add @vona-js/schema
```

## 使用

类型与默认配置：

```ts
import type {
  LayerDef,
  ModuleDefinition,
  VonaConfig,
  VonaHooks,
  VonaOptions,
} from '@vona-js/schema'
import { VonaConfigSchema } from '@vona-js/schema'

console.log(VonaConfigSchema.extends)
```

结合 `@vona-js/kit` 扩展 Schema：

```ts
import { extendConfigSchema } from '@vona-js/kit'

extendConfigSchema({ feature: { enabled: { $default: true } } })
```

## 开发与测试

- 构建：`pnpm build`
- 测试：在仓库根目录执行 `pnpm test`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`

## 构建与发布

- 使用 tsdown 构建：`pnpm build`
- 工作区统一发布：在仓库根目录执行 `pnpm release`

## 文档

- 开发指南：[schema.md](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/schema.md)
