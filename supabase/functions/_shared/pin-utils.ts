// Shared PIN hashing utilities using Web Crypto API (Edge Runtime compatible)

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return `pbkdf2:${arrayBufferToHex(salt.buffer)}:${arrayBufferToHex(derived)}`;
}

export async function comparePin(plaintextPin: string, hashedPin: string): Promise<boolean> {
  // Legacy plaintext
  if (!hashedPin.startsWith('$2') && !hashedPin.startsWith('pbkdf2:')) {
    return plaintextPin === hashedPin;
  }
  // Legacy bcrypt - can't verify in edge runtime, treat as needing reset
  if (hashedPin.startsWith('$2')) {
    return plaintextPin === hashedPin; // fallback direct compare won't work for bcrypt
  }
  // PBKDF2 format
  const [, saltHex, hashHex] = hashedPin.split(':');
  const salt = hexToArrayBuffer(saltHex);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(plaintextPin), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return arrayBufferToHex(derived) === hashHex;
}

export function needsPinMigration(storedPin: string): boolean {
  return !storedPin.startsWith('pbkdf2:');
}
