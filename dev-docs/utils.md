# Package Guide: @vona-js/utils

## Purpose
- Shared utility functions and structures used across packages.

## Development
- Build: `pnpm -F @vona-js/utils run build` or `cd packages/utils && pnpm run build`
- Dev: `pnpm -F @vona-js/utils run dev` or `cd packages/utils && pnpm run dev`
- Test: root `pnpm test` (picks `packages/utils/test`)
- Typecheck: root `pnpm typecheck`
- Lint: root `pnpm lint`

## File Layout
- Source: [packages/utils/src](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/utils/src)
- Structures: [packages/utils/src/structures](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/utils/src/structures)
- Tests: [packages/utils/test](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/utils/test)

## Guidelines
- Keep utilities small, pure, and well-named.
- Avoid dependencies unless necessary; prefer standard library and existing workspace utils.
- Maintain ESM-first exports and avoid side effects.

## Publishing
- `prepublishOnly` runs build automatically.
