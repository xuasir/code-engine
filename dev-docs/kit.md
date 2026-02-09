# Package Guide: @vona-js/kit

## Purpose
- Provides APIs for module developers and internal integration with the engine.
- Handles module definition, schema extension, layer operations, and runtime helpers.

## Key APIs
- Public: `defineModule`, `addLayer`, `addLayers`, `extendConfigSchema`, `useLogger`, `useVona`, `tryUseVona`
- Internal: `createLayerRuntime`, `createOVFS`

## Development
- Build: `pnpm -F @vona-js/kit run build` or `cd packages/kit && pnpm run build`
- Dev: `pnpm -F @vona-js/kit run dev` or `cd packages/kit && pnpm run dev`
- Test: run root `pnpm test` (Vitest picks up `packages/kit/test`)
- Typecheck: root `pnpm typecheck`
- Lint: root `pnpm lint`

## File Layout
- Source: [packages/kit/src](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/kit/src)
- Tests: [packages/kit/test](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/kit/test)
- Config loading: `src/loader/*`
- Layer system: `src/layer/*`
- Module definition: `src/module/*`

## Guidelines
- Use `defineModule` to declare modules with `meta`, optional `defaults`, `schema`, `hooks`, and `setup`.
- Add hooks via `vona.hooks.addHooks` if needed; prefer existing hook types from `@vona-js/schema`.
- Keep setup fast; large setup times trigger warnings.
- Reuse utilities from `@vona-js/utils` and types from `@vona-js/schema`.

## Publishing
- `prepublishOnly` runs build automatically.
