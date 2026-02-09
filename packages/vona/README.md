# vona-js

Vona 代码引擎的 CLI 与核心集成入口，支持命令行与编程式使用。

## 安装

```bash
pnpm add -D vona-js
```

## CLI 使用

```bash
npx vona prepare
# 或
pnpm exec vona prepare
```

可选参数：
- `--mode <development|production|test>` 指定运行模式
- `--refreshLayers` 刷新远程 Layer 缓存

## 编程式使用

```ts
import { loadVona } from 'vona-js'

const vona = await loadVona({
  mode: 'development',
  command: {
    name: 'prepare',
    args: {},
  },
})

await vona.close()
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

- 开发指南：[vona.md](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/vona.md)
