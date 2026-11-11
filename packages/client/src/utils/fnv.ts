/**
 * FNV-1a (64-bit) of a string's UTF-8 bytes, in hex: the same hash core's
 * sync gives a document (crates/taskmint-core/src/sync hash), so a document
 * written here and one written by core agree.
 */

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

export function fnv1a64(text: string): string {
  let hash = OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}
