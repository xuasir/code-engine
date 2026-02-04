import type { SchemaDefinition } from 'untyped'
import { useVona } from './context'

// 扩展配置 schema
export function extendConfigSchema(def: SchemaDefinition | (() => SchemaDefinition)): void {
  const ce = useVona()
  ce.hook('schema:extend', (schemas) => {
    schemas.push(typeof def === 'function' ? def() : def)
  })
}
