import crypto from 'crypto';

export const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
};

export async function digestStringAsync(algorithm: string, data: string) {
  const hash = crypto.createHash(algorithm.toLowerCase().replace('-', ''));
  hash.update(data, 'utf8');
  return hash.digest('hex');
}
