const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}
