export function validateEmail(email: string): boolean {
  const at = email.indexOf('@')
  if (at <= 0 || at === email.length - 1)
    return false
  const dot = email.indexOf('.', at)
  return dot > at + 1 && dot < email.length - 1
}
