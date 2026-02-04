// Shared PIN hashing utilities for edge functions
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

/**
 * Hash a PIN using bcrypt
 * @param pin - The plaintext PIN to hash
 * @returns The hashed PIN
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(pin, salt);
}

/**
 * Compare a plaintext PIN with a hashed PIN
 * @param plaintextPin - The plaintext PIN to check
 * @param hashedPin - The hashed PIN from the database
 * @returns True if the PIN matches, false otherwise
 */
export async function comparePin(plaintextPin: string, hashedPin: string): Promise<boolean> {
  // If the stored PIN doesn't look like a bcrypt hash (starts with $2), 
  // it's a legacy plaintext PIN - compare directly and flag for migration
  if (!hashedPin.startsWith('$2')) {
    // Legacy plaintext comparison for backwards compatibility
    return plaintextPin === hashedPin;
  }
  return await bcrypt.compare(plaintextPin, hashedPin);
}

/**
 * Check if a PIN needs to be migrated from plaintext to hashed
 * @param storedPin - The PIN stored in the database
 * @returns True if the PIN is plaintext and needs migration
 */
export function needsPinMigration(storedPin: string): boolean {
  return !storedPin.startsWith('$2');
}
