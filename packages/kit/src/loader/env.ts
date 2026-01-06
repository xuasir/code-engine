import type { CodeEngineEnv } from '@a-sir/code-engine-schema'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { CodeEngineMode } from '@a-sir/code-engine-schema'
import dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'

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
  const env: CodeEngineEnv = {
    mode,
    get dev() {
      return mode === CodeEngineMode.DEVELOPMENT
    },
    get prod() {
      return mode === CodeEngineMode.PRODUCTION
    },
    get test() {
      return mode === CodeEngineMode.TEST
    },
    get(key: string) {
      return process.env[key]
    },
    getAll(prefix = 'CE_') {
      const result: Record<string, string> = {}
      for (const key of Object.keys(process.env)) {
        if (key.startsWith(prefix)) {
          result[key] = process.env[key] || ''
        }
      }
      return result
    },
  }

  return env
}
