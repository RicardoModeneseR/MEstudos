export function uid(): string {
  return crypto.randomUUID();
}
export function nowStamp(): string {
  return new Date().toISOString();
}
