import * as Crypto from 'expo-crypto';
import type { Algorithm } from './types';
import type { ColorValue } from 'react-native';

const algorithmMap: Record<Algorithm, Crypto.CryptoDigestAlgorithm> = {
  'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256,
  'SHA-1': Crypto.CryptoDigestAlgorithm.SHA1,
  'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512,
};

export async function hashHex(
  algorithm: Algorithm,
  data: string
): Promise<string> {
  return await Crypto.digestStringAsync(algorithmMap[algorithm], data);
}

export function applyColorOpacity(color: ColorValue, opacity: number) {
  return typeof color === 'string' && color[0] === '#' && color.length === 7
    ? color + Number(Math.floor(opacity * 255)).toString(16)
    : color;
}
