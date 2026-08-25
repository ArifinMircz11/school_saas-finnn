import crypto from 'crypto';

// bcryptjs 2.x ships CommonJS with `var bcrypt = {}; bcrypt.hash = ...; module.exports = bcrypt`.
// Node's ESM interop only exposes that under `default`, so we resolve the callable module robustly.
async function bcryptModule() {
  const ns: any = await import('bcryptjs');
  const mod = ns.default && typeof ns.default.hash === 'function' ? ns.default : ns;
  return mod;
}

export async function hashPassword(plain: string): Promise<string> {
  const bcrypt = await bcryptModule();
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  const bcrypt = await bcryptModule();
  return bcrypt.compare(plain, hashed);
}

export function generateRandomCode(length = 6): string {
  const digits = '0123456789';
  let out = '';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    out += digits[arr[i]! % digits.length];
  }
  return out;
}

export function generateApplicationNo(prefix = 'APP'): string {
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  const suffix = Array.from(arr)
    .map((v) => (v % 10000).toString().padStart(4, '0'))
    .join('');
  return `${prefix}-${suffix}`;
}

export function generateAdmissionNo(): string {
  const arr = new Uint32Array(3);
  crypto.getRandomValues(arr);
  const suffix = Array.from(arr).map((v) => (v % 1000).toString().padStart(3, '0')).join('');
  return `ADM-${suffix}`;
}

export function generateCertificateNumber(): string {
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  const suffix = Array.from(arr).map((v) => (v % 10000).toString().padStart(4, '0')).join('');
  return `CER-${suffix}`;
}