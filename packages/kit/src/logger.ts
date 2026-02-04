import type { ConsolaInstance, ConsolaOptions } from 'consola'
import { consola, LogLevels } from 'consola'
import { tryUseVona } from './context'

export const logger = consola

export function useLogger(tag?: string, options: Partial<ConsolaOptions> = {}): ConsolaInstance {
  const ce = tryUseVona()
  if (ce?.options.debug) {
    options.level = LogLevels.debug
  }
  return tag ? logger.create(options).withTag(tag) : logger
}
