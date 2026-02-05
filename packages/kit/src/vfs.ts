import type {
  VFS,
  VfsCandidate,
  VfsHooks,
  VfsInspectResult,
  VfsNode,
  VfsOptions,
  VfsScopeContext,
  VfsSetup,
  VfsSource,
  VfsTemplate,
} from '@vona-js/schema'
import { createHooks } from 'hookable'
import micromatch from 'micromatch'
import { hash } from 'ohash'

class VFSImpl implements VFS {
  public hooks = createHooks<VfsHooks>()

  private nodes = new Map<string, VfsNode>()

  private root: string

  private isDev: boolean

  protected basePriority = 0

  public layerId?: string

  constructor(options: VfsOptions) {
    this.root = options.root
    this.isDev = options.isDev ?? false
  }

  scope(options: { layerId?: string, priority?: number }): VfsScopeContext {
    return new VfsScopeImpl(this, {
      layerId: options.layerId,
      basePriority: options.priority ?? this.basePriority,
    })
  }

  mount(virtualPath: string, physicalPath: string, options?: { priority?: number, originalPath?: string, pattern?: string }): void {
    const priority = options?.priority ?? this.basePriority
    const path = this.normalizePath(virtualPath)

    this.update(path, {
      key: hash({ path, priority, layerId: this.layerId }),
      layerId: this.layerId || 'unknown',
      priority,
      kind: 'reference',
      source: physicalPath,
      sourceType: 'mount',
      originalPath: options?.originalPath,
      pattern: options?.pattern,
    })
  }

  write(virtualPath: string, content: VfsSource, priority?: number): void {
    const p = priority ?? this.basePriority
    const path = this.normalizePath(virtualPath)

    this.update(path, {
      key: hash({ path, priority: p, layerId: this.layerId }),
      layerId: this.layerId || 'unknown',
      priority: p,
      kind: 'entity',
      source: content,
      sourceType: 'write',
    })
  }

  addTemplate(template: VfsTemplate): void {
    const path = this.normalizePath(template.path)

    this.update(path, {
      key: hash({ path, priority: this.basePriority, layerId: this.layerId }),
      layerId: this.layerId || 'unknown',
      priority: this.basePriority,
      kind: 'entity',
      source: () => template.get({ vfs: this }),
      sourceType: 'template',
      watch: template.watch,
    })
  }

  remove(virtualPath: string, layerId?: string): void {
    const normalizedPath = this.normalizePath(virtualPath)
    const existing = this.nodes.get(normalizedPath)

    if (!existing)
      return

    if (!layerId) {
      this.nodes.delete(normalizedPath)
      this.hooks.callHook('file:removed', normalizedPath)
      return
    }

    const candidates = existing.candidates.filter(candidate => candidate.layerId !== layerId)
    if (!candidates.length) {
      this.nodes.delete(normalizedPath)
      this.hooks.callHook('file:removed', normalizedPath)
      return
    }

    const nextActive = pickActiveCandidate(candidates)
    const nextNode: VfsNode = {
      path: normalizedPath,
      active: nextActive,
      candidates,
    }

    this.nodes.set(normalizedPath, nextNode)
    if (existing.active.key !== nextActive.key)
      this.hooks.callHook('file:updated', nextNode)
  }

  read(path: string): VfsNode | undefined {
    return this.nodes.get(this.normalizePath(path))
  }

  glob(pattern: string): VfsNode[] {
    const results: VfsNode[] = []
    const normalizedPattern = this.normalizePath(pattern)

    for (const [path, node] of this.nodes) {
      if (micromatch.isMatch(path, normalizedPattern)) {
        results.push(node)
      }
    }

    return results
  }

  inspect(path: string): VfsInspectResult | undefined {
    const node = this.nodes.get(this.normalizePath(path))
    if (!node)
      return undefined

    return {
      path: node.path,
      active: node.active,
      candidates: node.candidates,
    }
  }

  async use(setup: VfsSetup): Promise<void> {
    await setup(this)
  }

  private update(path: string, candidate: VfsCandidate): void {
    const existing = this.nodes.get(path)

    if (!existing) {
      const node: VfsNode = {
        path,
        active: candidate,
        candidates: [candidate],
      }
      this.nodes.set(path, node)
      this.hooks.callHook('file:added', node)
      return
    }

    const candidates = [...existing.candidates, candidate]
    const nextActive = pickActiveCandidate(candidates)
    const nextNode: VfsNode = {
      path,
      active: nextActive,
      candidates,
    }

    this.nodes.set(path, nextNode)
    this.hooks.callHook('file:updated', nextNode)
  }

  private normalizePath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`
  }

  setBasePriority(priority: number, layerId?: string): void {
    this.basePriority = priority
    this.layerId = layerId
  }

  getBasePriority(): number {
    return this.basePriority
  }
}

class VfsScopeImpl implements VfsScopeContext {
  private vfs: VFSImpl
  private basePriority: number
  public layerId?: string

  constructor(vfs: VFSImpl, options: { layerId?: string, basePriority: number }) {
    this.vfs = vfs
    this.layerId = options.layerId
    this.basePriority = options.basePriority
  }

  scope(options: { layerId?: string, priority?: number }): VfsScopeContext {
    return new VfsScopeImpl(this.vfs, {
      layerId: options.layerId || this.layerId,
      basePriority: options.priority ?? this.basePriority,
    })
  }

  mount(virtualPath: string, physicalPath: string, options?: { priority?: number, originalPath?: string, pattern?: string }): void {
    this.vfs.mount(virtualPath, physicalPath, {
      priority: this.basePriority,
      ...options,
      ...(options?.priority !== undefined ? { priority: options.priority } : {}),
    })
  }

  write(virtualPath: string, content: VfsSource, priority?: number): void {
    this.vfs.write(virtualPath, content, priority ?? this.basePriority)
  }

  addTemplate(template: VfsTemplate): void {
    const originalPriority = this.vfs.getBasePriority()
    const originalLayerId = this.vfs.layerId

    this.vfs.setBasePriority(this.basePriority, this.layerId)
    this.vfs.addTemplate(template)

    this.vfs.setBasePriority(originalPriority, originalLayerId)
  }

  remove(virtualPath: string): void {
    this.vfs.remove(virtualPath, this.layerId)
  }
}

function pickActiveCandidate(candidates: VfsCandidate[]): VfsCandidate {
  let picked = candidates[0]
  for (const candidate of candidates) {
    if (!picked || candidate.priority > picked.priority) {
      picked = candidate
      continue
    }
    if (candidate.priority === picked.priority && candidate.key !== picked.key) {
      picked = candidate
    }
  }
  return picked
}

export function createVFS(options: VfsOptions): VFS {
  return new VFSImpl(options)
}

export function defineVfsSetup(setup: VfsSetup): VfsSetup {
  return setup
}
