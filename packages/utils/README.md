# @vona-js/utils

常用工具函数与数据结构集合，覆盖路径、字符串、函数节流、防抖与优先队列等。

## 安装

```bash
pnpm add @vona-js/utils
```

## 使用

```ts
import {
  camelCase,
  capitalize,
  debounce,
  normalizeSlashes,
  PriorityHeap,
  toKebabToken,
  toPascalToken,
} from '@vona-js/utils'

const run = debounce(() => { /* ... */ }, 200)

const heap = new PriorityHeap<number>()
heap.push(10, 1)
heap.push(20, 5)
const top = heap.pop()

normalizeSlashes('a\\b\\c') // => 'a/b/c'
camelCase('hello-world') // => 'helloWorld'
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

- 开发指南：[utils.md](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/utils.md)
