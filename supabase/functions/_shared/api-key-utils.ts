// Utilities for generating + hashing developer API keys
// Format: ink_live_<32 random hex chars>

export function generateApiKey(): { fullKey: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const fullKey = `ink_live_${hex}`;
  const prefix = fullKey.substring(0, 12); // "ink_live_xxx"
  return { fullKey, prefix };
}

export async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
