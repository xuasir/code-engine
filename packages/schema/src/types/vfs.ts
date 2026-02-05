import type { Hookable } from 'hookable'

export type VfsKind = 'reference' | 'entity'

export type VfsSource = string | (() => string | Promise<string>)

export interface VfsCandidate {
  key: string
  layerId: string
  priority: number
  kind: VfsKind
  source: VfsSource
  sourceType: 'mount' | 'write' | 'template'
  originalPath?: string
  pattern?: string
  watch?: string[]
}

export interface VfsNode {
  path: string
  active: VfsCandidate
  candidates: VfsCandidate[]
}

export interface VfsTemplate {
  path: string
  watch?: string[]
  get: (ctx: VfsTemplateContext) => string | Promise<string>
}

export interface VfsTemplateContext {
  vfs: VFS
}

export interface VfsScopeContext {
  layerId?: string
  priority?: number
  scope: (options: { layerId?: string, priority?: number }) => VfsScopeContext
  mount: (virtualPath: string, physicalPath: string, options?: {
    priority?: number
    originalPath?: string
    pattern?: string
  }) => void
  write: (virtualPath: string, content: VfsSource, priority?: number) => void
  addTemplate: (template: VfsTemplate) => void
  remove: (virtualPath: string) => void
}

export interface VfsHooks {
  'file:added': (node: VfsNode) => void | Promise<void>
  'file:updated': (node: VfsNode) => void | Promise<void>
  'file:removed': (path: string) => void | Promise<void>
}

export interface VfsInspectResult {
  path: string
  active: VfsCandidate
  candidates: VfsCandidate[]
}

export interface VFS extends VfsScopeContext {
  hooks: Hookable<VfsHooks>
  read: (path: string) => VfsNode | undefined
  glob: (pattern: string) => VfsNode[]
  inspect: (path: string) => VfsInspectResult | undefined
  use: (setup: VfsSetup) => void | Promise<void>
}

export interface VfsOptions {
  root: string
  isDev?: boolean
}

export type VfsSetup = (ctx: VfsScopeContext) => void | Promise<void>

export type DefineVfsSetup = (setup: VfsSetup) => VfsSetup
