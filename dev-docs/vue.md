# Package Guide: @vona-js/plugin-vue

## Purpose
- Vue plugin integration for the engine and module ecosystem.

## Development
- Build: `pnpm -F @vona-js/plugin-vue run build` or `cd packages/vue && pnpm run build`
- Dev: `pnpm -F @vona-js/plugin-vue run dev` or `cd packages/vue && pnpm run dev`
- Test: root `pnpm test` (picks `packages/vue/test`)
- Typecheck: root `pnpm typecheck`
- Lint: root `pnpm lint`

## File Layout
- Source: [packages/vue/src](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/vue/src)
- Tests: [packages/vue/test](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/vue/test)

## Guidelines
- Keep the plugin ESM-first with stable root exports.
- Ensure compatibility with engine module contracts and shared types.
- Prefer lightweight abstractions; avoid framework-specific coupling outside plugin scope.

## Publishing
- `prepublishOnly` runs build automatically.
