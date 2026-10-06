import type { ColorValue } from 'react-native';

/** Throws unless `algorithm` is exactly one of `allowed`. */
export function assertAlgorithm<T extends string>(
  algorithm: unknown,
  allowed: readonly T[]
): asserts algorithm is T {
  if (!allowed.includes(algorithm as T)) {
    throw new Error(
      `Unsupported algorithm: ${String(algorithm)}. Expected one of: ${allowed.join(', ')}.`
    );
  }
}

export function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Converts a hex string to a Uint8Array. Throws on odd length or non-hex characters. */
export function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex string must have an even length. Got: ${hex}`);
  }
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Hex string contains non-hex characters.');
  }
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

export function bufferStartsWith(
  buffer: Uint8Array,
  prefix: Uint8Array
): boolean {
  if (prefix.length > buffer.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buffer[i] !== prefix[i]) return false;
  }
  return true;
}

export function concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function applyColorOpacity(
  color: ColorValue,
  opacity: number
): ColorValue {
  if (typeof color === 'string' && color[0] === '#' && color.length === 7) {
    const hex = Number(Math.floor(opacity * 255))
      .toString(16)
      .padStart(2, '0');
    return color + hex;
  }
  return color;
}
