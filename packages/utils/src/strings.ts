export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function camelCase(str: string): string {
  return str
    .split('-')
    .map((part, index) => (index === 0 ? part : capitalize(part)))
    .join('')
}

export function toKebabToken(value: string): string {
  return value
    .replace(/\[(.+)\]/g, '$1')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export function toPascalToken(value: string): string {
  return value
    .replace(/\[(.+)\]/g, '$1')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalize)
    .join('')
}

export function toPascalByPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(toPascalToken)
    .join('')
}
