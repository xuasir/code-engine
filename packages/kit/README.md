# @vona-js/kit

`@vona-js/kit` 是给 module 开发者使用的 API 集合。

## Module API（稳定）

从 `@vona-js/kit` 根入口导出：

- `defineModule`
- `addLayer` / `addLayers`
- `extendConfigSchema`
- `useLogger`
- `useVona`
- `tryUseVona`

## Internal API（非稳定）

`@vona-js/kit/internal` 用于 `vona-js` 内核集成，默认不作为 module 开发者 API，后续可能调整。

示例：

```ts
import { defineModule, addLayer, useVona } from '@vona-js/kit'
```

```ts
import { createPipeline, createOVFS } from '@vona-js/kit/internal'
```
