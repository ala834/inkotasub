// Helpers for the numeric passcode (PIN) auth system.
// Supabase Auth requires passwords ≥ 6 chars. To allow 4–6 digit PINs
// (e.g. "1234"), we deterministically wrap the PIN into a longer string
// before handing it to Supabase Auth. The wrapper is opaque to the user.

export const PASSCODE_MIN = 4;
export const PASSCODE_MAX = 6;

export const isValidPasscode = (pin: string): boolean =>
  /^\d+$/.test(pin) && pin.length >= PASSCODE_MIN && pin.length <= PASSCODE_MAX;

/**
 * Wrap a numeric PIN into a stable Supabase password.
 * NEVER change this format — existing accounts depend on it.
 */
export const wrapPasscode = (pin: string): string => `inkpin_v1_${pin}`;
