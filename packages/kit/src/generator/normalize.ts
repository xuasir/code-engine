import type { GenArtifact, NormalizedArtifact } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { extname, normalize } from 'pathe'

function normalizePath(input: string): string {
  const normalized = normalize(input).replace(/\\/g, '/').replace(/^\.\//, '')
  return normalized.replace(/^\/+/, '')
}

function normalizeText(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n')
  if (!normalized.endsWith('\n')) {
    return `${normalized}\n`
  }
  return normalized
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function normalizeArtifacts(artifacts: GenArtifact[]): NormalizedArtifact[] {
  const map = new Map<string, NormalizedArtifact>()

  for (const artifact of artifacts) {
    const path = normalizePath(artifact.path)
    if (!path) {
      continue
    }

    const ext = artifact.ext || extname(path) || '.txt'

    if (artifact.bytes) {
      const bytes = Buffer.from(artifact.bytes)
      map.set(path, {
        ...artifact,
        path,
        ext,
        bytes,
        content: undefined,
        hash: hashBytes(bytes),
        size: bytes.byteLength,
      })
      continue
    }

    const content = normalizeText(artifact.content ?? '')
    const bytes = Buffer.from(content)
    map.set(path, {
      ...artifact,
      path,
      ext,
      content,
      bytes: undefined,
      hash: hashBytes(bytes),
      size: bytes.byteLength,
    })
  }

  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path))
}
