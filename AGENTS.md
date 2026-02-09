# Vona JS AI Agent Guide

This document provides comprehensive information for AI agents working on the vona-js repository.

## Project Overview

- Monorepo using pnpm workspaces
- Language: TypeScript/JavaScript (ESM-first)
- Package Manager: pnpm (required)
- Node Version: >= 20 recommended (ESNext + strict TS config)
- Build System: tsdown for packages; Vitepress for docs; Vite for playground
- Directory Structure: `packages/` (core), `docs/` (site), `playground/` (examples), `rfc/` (design docs)
- Core packages (`packages/`): `@vona-js/kit`, `@vona-js/schema`, `@vona-js/utils`, `vona-js`, `@vona-js/plugin-vue`

## Setup and Development

### Initial Setup
- Run `pnpm install` to install dependencies
- Run `pnpm build` to build all packages
- For docs development, run `pnpm docs` to start the local Vitepress server

### Key Scripts (root)
- `pnpm build`: recursively build `./packages/*` (tsdown)
- `pnpm dev`: recursive dev/watch mode
- `pnpm lint`: ESLint with cache
- `pnpm typecheck`: TypeScript type check (`tsc --noEmit`)
- `pnpm test`: run Vitest
- `pnpm docs`: docs development (Vitepress)
- `pnpm docs:build`: docs build (Vitepress)
- `pnpm version`: bump versions (bumpp)
- `pnpm release`: publish `./packages/*`

## Testing

### Running Tests
- Root: `pnpm test`
- Per-package: run tests inside target package directory (Vitest)
- Prefer building before testing to ensure artifacts are consistent

### Testing Conventions
- Use Vitest assertions and testing utilities
- Reuse existing `test/` layouts; avoid adding unreviewed dependencies

## Project Structure

### Key Directories
- `packages/`: core code
  - `kit/`: module developer APIs and internal integration
  - `schema/`: types and configuration schema
  - `utils/`: common utilities
  - `vona/`: core CLI and engine integration
  - `vue/`: Vue-related plugin
- `docs/`: documentation site (Vitepress)
- `playground/`: example app (`playground/vite-app` uses Vite)
- `rfc/`: design and proposal docs

### Package Guides
> @vona-js/kit: [Development Guide](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/kit.md)
>
> @vona-js/schema: [Development Guide](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/schema.md)
>
> @vona-js/utils: [Development Guide](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/utils.md)
>
> vona-js (CLI): [Development Guide](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/vona.md)
>
> @vona-js/plugin-vue: [Development Guide](file:///Users/guo.xu/Documents/code/tools/code-engine/dev-docs/vue.md)

## Code Style and Conventions

### Formatting and Lint
- Run `pnpm lint` or per-package `eslint --fix` (automated via `lint-staged`)
- Keep style consistent (uses `@antfu/eslint-config`)

### TypeScript
- Strict config per root [`tsconfig.json`](file:///Users/guo.xu/Documents/code/tools/code-engine/tsconfig.json)
- Run `pnpm typecheck` for type validation

### Modules and Imports
- ESM-first; keep workspace exports and entries consistent (`exports`/`types`/`main`/`module`)
- Prefer utilities and types from `@vona-js/*`

## Common Workflows

### Adding New Features
1. Identify the appropriate package under `packages/` (e.g., `kit`/`schema`/`utils`/`vona`/`vue`)
2. Follow existing patterns and APIs
3. Add or update tests in the package `test/` directory
4. Run `pnpm build && pnpm typecheck && pnpm lint`
5. Run `pnpm test` at the root to validate

### Documentation
- Dev: `pnpm docs`
- Build: `pnpm docs:build`
- Sources are under `docs/`; theme and config in `.vitepress/`

### Versioning and Release
- Bump versions: `pnpm version`
- Publish packages: `pnpm release`
- Prepublish builds are defined via each package's `prepublishOnly`

## Dependencies and Tools

### Key Dependencies
- Build/Bundle: tsdown, vite
- Testing: vitest
- Lint/Types: eslint, typescript
- Runtime/Utilities: `c12`, `consola`, `defu`, `dotenv`/`dotenv-expand`, `hookable`, `micromatch`, `pathe`, `ohash`, `untyped`, `unctx`, etc.

### Dev Tools
- `tsx` for TS execution
- `lint-staged` + `simple-git-hooks` for pre-commit checks (see root simple-git-hooks config)
- `bumpp` for version bumping

## Performance and Stability
- Mind import costs and bundle size; keep dependencies minimal
- tsdown-centric build; avoid unnecessary multi-entry or circular dependencies
- Monitor module setup timing (warnings provided in `@vona-js/kit`)

## Troubleshooting

### Common Issues
- Use pnpm; do not mix with npm/yarn (root has `pnpm-workspace.yaml`)
- Build before testing to ensure consistency
- Keep Node version compatible (>= 20 recommended)
- Pre-commit hooks: repository uses `simple-git-hooks` and `lint-staged`

### Getting Help
- See root [CONTRIBUTING.md](file:///Users/guo.xu/Documents/code/tools/code-engine/CONTRIBUTING.md)
- Check per-package READMEs (e.g., [README.md](file:///Users/guo.xu/Documents/code/tools/code-engine/packages/kit/README.md) in kit)
- Issues: https://github.com/xuasir/code-engine/issues
