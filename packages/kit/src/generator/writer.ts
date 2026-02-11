import type {
  ArtifactsReportPayload,
  ArtifactsStateSnapshot,
  GenArtifact,
  NormalizedArtifact,
} from './types'
import { Buffer } from 'node:buffer'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { dirname, join } from 'pathe'

const EMPTY_STATE: ArtifactsStateSnapshot = {
  version: 1,
  managed: {},
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return
  }

  let cursor = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index])
    }
  })

  await Promise.all(workers)
}

export async function loadArtifactsState(stateFileAbs: string): Promise<ArtifactsStateSnapshot> {
  try {
    const content = await readFile(stateFileAbs, 'utf8')
    const parsed = JSON.parse(content) as ArtifactsStateSnapshot
    if (!parsed || parsed.version !== 1 || !parsed.managed || typeof parsed.managed !== 'object') {
      return { ...EMPTY_STATE }
    }
    return parsed
  }
  catch {
    return { ...EMPTY_STATE }
  }
}

export async function writeArtifactsState(stateFileAbs: string, state: ArtifactsStateSnapshot): Promise<void> {
  await mkdir(dirname(stateFileAbs), { recursive: true })
  await writeFile(stateFileAbs, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function writeAtomic(absPath: string, artifact: NormalizedArtifact): Promise<number | undefined> {
  const tmpPath = `${absPath}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`
  await mkdir(dirname(absPath), { recursive: true })

  if (artifact.bytes) {
    await writeFile(tmpPath, Buffer.from(artifact.bytes))
  }
  else {
    await writeFile(tmpPath, artifact.content ?? '', 'utf8')
  }

  await rename(tmpPath, absPath)

  try {
    const fileStat = await stat(absPath)
    return fileStat.mtimeMs
  }
  catch {
    return undefined
  }
}

export interface PersistDiskOptions {
  outputDir: string
  stateFile: string
  writeConcurrency: number
  clean: boolean
  writes: NormalizedArtifact[]
  removes: string[]
  allArtifacts: NormalizedArtifact[]
  previousState: ArtifactsStateSnapshot
}

export interface PersistDiskResult {
  writtenPaths: string[]
  removedPaths: string[]
  state: ArtifactsStateSnapshot
}

export async function persistDisk(options: PersistDiskOptions): Promise<PersistDiskResult> {
  const {
    outputDir,
    stateFile,
    writeConcurrency,
    clean,
    writes,
    removes,
    allArtifacts,
    previousState,
  } = options

  const writtenMtimeByPath = new Map<string, number | undefined>()

  await runWithConcurrency(writes, writeConcurrency, async (artifact) => {
    const mtimeMs = await writeAtomic(join(outputDir, artifact.path), artifact)
    writtenMtimeByPath.set(artifact.path, mtimeMs)
  })

  if (clean && removes.length > 0) {
    await runWithConcurrency(removes, writeConcurrency, async (path) => {
      await rm(join(outputDir, path), { force: true })
    })
  }

  const managed: ArtifactsStateSnapshot['managed'] = {}
  for (const artifact of allArtifacts) {
    const previousEntry = previousState.managed[artifact.path]
    managed[artifact.path] = {
      hash: artifact.hash,
      size: artifact.size,
      mtimeMs: writtenMtimeByPath.has(artifact.path)
        ? writtenMtimeByPath.get(artifact.path)
        : previousEntry?.mtimeMs,
    }
  }

  const state: ArtifactsStateSnapshot = {
    version: 1,
    managed,
  }

  await writeArtifactsState(join(outputDir, stateFile), state)

  return {
    writtenPaths: writes.map(item => item.path),
    removedPaths: clean ? [...removes] : [],
    state,
  }
}

export interface PersistMemoryOptions {
  allArtifacts: NormalizedArtifact[]
}

export interface PersistMemoryResult {
  state: ArtifactsStateSnapshot
  entries: GenArtifact[]
}

export async function persistMemory(options: PersistMemoryOptions): Promise<PersistMemoryResult> {
  const managed: ArtifactsStateSnapshot['managed'] = {}
  for (const artifact of options.allArtifacts) {
    managed[artifact.path] = {
      hash: artifact.hash,
      size: artifact.size,
    }
  }

  return {
    state: {
      version: 1,
      managed,
    },
    entries: options.allArtifacts,
  }
}

export async function writeArtifactsReport(
  outputDir: string,
  reportFile: string,
  payload: ArtifactsReportPayload,
): Promise<string> {
  const reportPath = join(outputDir, reportFile)
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return reportFile
}
