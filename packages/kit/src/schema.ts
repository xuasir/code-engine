import type { SchemaDefinition } from 'untyped'
import { useCodeEngine } from './context'

// 扩展配置 schema
export function extendConfigSchema(def: SchemaDefinition | (() => SchemaDefinition)): void {
  const ce = useCodeEngine()
  ce.hook('schema:extend', (schemas) => {
    schemas.push(typeof def === 'function' ? def() : def)
  })
}
