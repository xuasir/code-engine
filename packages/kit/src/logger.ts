import type { ConsolaInstance, ConsolaOptions } from 'consola'
import { consola } from 'consola'

export const logger = consola

export function useLogger(tag?: string, options: Partial<ConsolaOptions> = {}): ConsolaInstance {
  return tag ? logger.create(options).withTag(tag) : logger
}
