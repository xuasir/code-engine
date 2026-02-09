# Package Guide: @vona-js/schema

## Purpose
- Central types and configuration schema for the engine and modules.
- Defines engine interfaces, env, hooks, modules, and layer/ovfs types.

## Development
- Build: `pnpm -F @vona-js/schema run build` or `cd packages/schema && pnpm run build`
- Dev: `pnpm -F @vona-js/schema run dev` or `cd packages/schema && pnpm run dev`
- Test: root `pnpm test` (picks `packages/schema/test`)
- Typecheck: root `pnpm typecheck`
- Lint: root `pnpm lint`

## File Layout
- Source: [packages/schema/src](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/schema/src)
- Types: [packages/schema/src/types](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/schema/src/types)
- Tests: [packages/schema/test](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/schema/test)

## Guidelines
- Extend types under `src/types/*` with minimal surface and clear responsibilities.
- Keep `VonaHooks`, `VonaEnv`, `Vona`, and module contracts stable.
- Prefer additive changes; avoid breaking exports or runtime assumptions.

## Publishing
- `prepublishOnly` runs build automatically.
