import type { VonaEnv } from '@vona-js/schema'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { VonaMode } from '@vona-js/schema'
import dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'

export async function loadEnv(root: string, mode: VonaMode): Promise<void> {
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

export function createEnv(root: string, mode: VonaMode): VonaEnv {
  const env: VonaEnv = {
    mode,
    get dev() {
      return mode === VonaMode.DEVELOPMENT
    },
    get prod() {
      return mode === VonaMode.PRODUCTION
    },
    get test() {
      return mode === VonaMode.TEST
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
