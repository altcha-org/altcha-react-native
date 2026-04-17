import type { ColorValue } from 'react-native';

export function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex string must have even length. Got: ${hex}`);
  }
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    buf[i / 2] = parseInt(hex.substring(i, i + 2), 16);
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
