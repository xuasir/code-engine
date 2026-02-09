# Package Guide: vona-js (CLI)

## Purpose
- Provides the CLI and integrates engine modules and workflows.

## Development
- Build: `pnpm -F vona-js run build` or `cd packages/vona && pnpm run build`
- Dev: `pnpm -F vona-js run dev` or `cd packages/vona && pnpm run dev`
- Test: root `pnpm test` (picks `packages/vona/test`)
- Typecheck: root `pnpm typecheck`
- Lint: root `pnpm lint`

## File Layout
- Source: [packages/vona/src](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/vona/src)
- CLI: [packages/vona/src/cli](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/vona/src/cli)
- Commands: [packages/vona/src/cli/commands](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/vona/src/cli/commands)
- Tests: [packages/vona/test](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/vona/test)
- Binary: `bin.vona` maps to `dist/cli/index.mjs`

## Guidelines
- Add new commands under `src/cli/commands` and register them via the CLI index.
- Use `@vona-js/kit` to integrate with engine hooks and layer systems.
- Keep CLI UX minimal, consistent, and scriptable.

## Publishing
- `prepublishOnly` runs build automatically; CLI is published from `dist`.
