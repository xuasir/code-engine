import type { CodeEngineEnv } from '@a-sir/code-engine-schema'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { CodeEngineMode } from '@a-sir/code-engine-schema'
import dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'

export class Env implements CodeEngineEnv {
  mode: CodeEngineMode
  root: string
  private _env: Record<string, string> = {}

  constructor(root: string, mode: CodeEngineMode) {
    this.root = root
    this.mode = mode
    // Initialize _env with current process.env which should be loaded by now
    this._env = process.env as Record<string, string>
  }

  get dev(): boolean {
    return this.mode === CodeEngineMode.DEVELOPMENT
  }

  get prod(): boolean {
    return this.mode === CodeEngineMode.PRODUCTION
  }

  get test(): boolean {
    return this.mode === CodeEngineMode.TEST
  }

  get(key: string): string | undefined {
    return process.env[key]
  }

  getAll(prefix = 'CE_'): Record<string, string> {
    const result: Record<string, string> = {}
    for (const key of Object.keys(process.env)) {
      if (key.startsWith(prefix)) {
        result[key] = process.env[key] || ''
      }
    }
    return result
  }
}

export async function loadEnv(root: string, mode: CodeEngineMode): Promise<void> {
  const files = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    `.env.local`,
    `.env`,
  ]

  for (const file of files) {
    const filePath = path.resolve(root, file)
    if (fs.existsSync(filePath)) {
      const envConfig = dotenv.config({ path: filePath })
      dotenvExpand.expand(envConfig)
    }
  }
}

export function createEnv(root: string, mode: CodeEngineMode): CodeEngineEnv {
  return new Env(root, mode)
}
