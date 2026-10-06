import {
  assertAlgorithm,
  bufferToHex,
  hexToBuffer,
  bufferStartsWith,
  concatBuffers,
} from './helpers';
import type {
  Algorithm,
  ChallengeParameters,
  Challenge,
  Solution,
} from './types';

// ---------------------------------------------------------------------------
// Crypto global accessors — lazy so polyfills loaded after this module work
// ---------------------------------------------------------------------------

function getCrypto(): Crypto | undefined {
  return (globalThis as unknown as Record<string, unknown>).crypto as
    Crypto | undefined;
}

function getQCrypto(): Record<string, unknown> {
  return (getCrypto() ?? {}) as Record<string, unknown>;
}

function requireSubtleCrypto(): SubtleCrypto {
  const subtle = getCrypto()?.subtle;
  if (!subtle) {
    throw new Error(
      'crypto.subtle is not available. ' +
        'Install react-native-quick-crypto and call its polyfill setup ' +
        'before using this widget: https://github.com/margelo/react-native-quick-crypto'
    );
  }
  return subtle;
}

function requireScrypt(): (
  password: Uint8Array,
  salt: Uint8Array,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
  callback: (err: Error | null, key?: ArrayBuffer) => void
) => void {
  const fn = getQCrypto().scrypt;
  if (typeof fn !== 'function') {
    throw new Error(
      'crypto.scrypt is not available. ' +
        'Install react-native-quick-crypto and call its polyfill setup ' +
        'before using this widget: https://github.com/margelo/react-native-quick-crypto'
    );
  }
  return fn as ReturnType<typeof requireScrypt>;
}

function requireArgon2(): (
  algorithm: string,
  params: {
    message: Uint8Array;
    nonce: Uint8Array;
    passes: number;
    memory: number;
    parallelism: number;
    tagLength: number;
  },
  callback: (err: Error | null, result: ArrayBuffer) => void
) => void {
  const fn = getQCrypto().argon2;
  if (typeof fn !== 'function') {
    throw new Error(
      'crypto.argon2 is not available. ' +
        'Install react-native-quick-crypto and call its polyfill setup ' +
        'before using this widget: https://github.com/margelo/react-native-quick-crypto'
    );
  }
  return fn as ReturnType<typeof requireArgon2>;
}

// ---------------------------------------------------------------------------
// Feature detection — memoized, lazy
// ---------------------------------------------------------------------------

let _hasSubtleCrypto: boolean | undefined;
export function hasSubtleCrypto(): boolean {
  if (_hasSubtleCrypto === undefined) {
    _hasSubtleCrypto = typeof getCrypto()?.subtle?.digest === 'function';
  }
  return _hasSubtleCrypto;
}

let _hasScrypt: boolean | undefined;
export function hasScryptSupport(): boolean {
  if (_hasScrypt === undefined) {
    _hasScrypt = typeof getQCrypto().scrypt === 'function';
  }
  return _hasScrypt;
}

let _hasArgon2: boolean | undefined;
export function hasArgon2Support(): boolean {
  if (_hasArgon2 === undefined) {
    _hasArgon2 = typeof getQCrypto().argon2 === 'function';
  }
  return _hasArgon2;
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

const ALGORITHMS: readonly Algorithm[] = [
  'SHA-256',
  'SHA-384',
  'SHA-512',
  'PBKDF2/SHA-256',
  'PBKDF2/SHA-384',
  'PBKDF2/SHA-512',
  'ARGON2ID',
  'SCRYPT',
];

async function deriveKeySha(
  parameters: ChallengeParameters,
  saltBuf: Uint8Array,
  passwordBuf: Uint8Array
): Promise<Uint8Array> {
  const subtle = requireSubtleCrypto();
  const { algorithm, keyLength = 32 } = parameters;
  const iterations = Math.max(1, parameters.cost);
  // Cast to Uint8Array<ArrayBuffer> — SubtleCrypto requires ArrayBuffer-backed views,
  // not the broader ArrayBufferLike that TypeScript 5 infers by default.
  let derivedKey = concatBuffers(
    saltBuf,
    passwordBuf
  ) as unknown as Uint8Array<ArrayBuffer>;
  // Each round hashes the full previous digest; truncate to keyLength only at the end,
  // matching altcha-lib and the other language ports.
  for (let i = 0; i < iterations; i++) {
    derivedKey = new Uint8Array(await subtle.digest(algorithm, derivedKey));
  }
  return derivedKey.slice(0, keyLength);
}

async function deriveKeyPbkdf2(
  parameters: ChallengeParameters,
  saltBuf: Uint8Array,
  passwordBuf: Uint8Array
): Promise<Uint8Array> {
  const subtle = requireSubtleCrypto();
  const { algorithm, cost, keyLength = 32 } = parameters;
  const keyMaterial = await subtle.importKey(
    'raw',
    passwordBuf as unknown as Uint8Array<ArrayBuffer>,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  // deriveBits supports any key length, unlike deriving an AES key (16, 24 or 32 bytes only).
  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuf as unknown as Uint8Array<ArrayBuffer>,
      iterations: cost,
      hash: algorithm.slice('PBKDF2/'.length),
    },
    keyMaterial,
    keyLength * 8
  );
  return new Uint8Array(derivedBits);
}

function deriveKeyScrypt(
  parameters: ChallengeParameters,
  saltBuf: Uint8Array,
  passwordBuf: Uint8Array
): Promise<Uint8Array> {
  const { cost, keyLength = 32, memoryCost = 8, parallelism = 1 } = parameters;
  // OpenSSL rejects when memory required >= maxmem.
  // Required ≈ 128 * N * r + 128 * r * p. Use 2× safety margin.
  const maxmem = 128 * cost * (memoryCost + parallelism) * 2;
  return new Promise((resolve, reject) => {
    requireScrypt()(
      passwordBuf,
      saltBuf,
      keyLength,
      { N: cost, r: memoryCost, p: parallelism, maxmem },
      (err, key) => {
        if (err || !key)
          return reject(err ?? new Error('scrypt returned no key'));
        resolve(new Uint8Array(key));
      }
    );
  });
}

function deriveKeyArgon2id(
  parameters: ChallengeParameters,
  saltBuf: Uint8Array,
  passwordBuf: Uint8Array
): Promise<Uint8Array> {
  const {
    cost,
    keyLength = 32,
    memoryCost = 16384,
    parallelism = 1,
  } = parameters;
  return new Promise((resolve, reject) => {
    requireArgon2()(
      'argon2id',
      {
        message: passwordBuf,
        nonce: saltBuf,
        passes: cost,
        memory: memoryCost,
        parallelism,
        tagLength: keyLength,
      },
      (err, result) => {
        if (err || !result)
          return reject(err ?? new Error('argon2 returned no result'));
        resolve(new Uint8Array(result));
      }
    );
  });
}

function deriveKey(
  parameters: ChallengeParameters,
  saltBuf: Uint8Array,
  passwordBuf: Uint8Array
): Promise<Uint8Array> {
  const { algorithm } = parameters;
  // Exact names only: no case folding and no fallback to SHA-256, matching altcha-lib.
  assertAlgorithm(algorithm, ALGORITHMS);
  switch (algorithm) {
    case 'SCRYPT':
      return deriveKeyScrypt(parameters, saltBuf, passwordBuf);
    case 'ARGON2ID':
      return deriveKeyArgon2id(parameters, saltBuf, passwordBuf);
    case 'PBKDF2/SHA-256':
    case 'PBKDF2/SHA-384':
    case 'PBKDF2/SHA-512':
      return deriveKeyPbkdf2(parameters, saltBuf, passwordBuf);
    default:
      return deriveKeySha(parameters, saltBuf, passwordBuf);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Largest counter a big-endian uint32 encodes exactly; `setUint32` wraps above it. */
const MAX_COUNTER = 0xffffffff;

function makePassword(nonceBuf: Uint8Array, counter: number): Uint8Array {
  if (!Number.isInteger(counter) || counter < 0 || counter > MAX_COUNTER) {
    throw new RangeError(
      `counter must be an integer from 0 to ${MAX_COUNTER}. Got: ${counter}`
    );
  }
  const counterBuf = new Uint8Array(4);
  new DataView(counterBuf.buffer).setUint32(0, counter, false); // big-endian
  return concatBuffers(nonceBuf, counterBuf);
}

/**
 * Throws unless `keyPrefix` is a non-empty hex string no longer than the key.
 * A non-hex or overlong prefix can never be matched by any derived key.
 */
function assertKeyPrefix(
  keyPrefix: unknown,
  keyLength: number
): asserts keyPrefix is string {
  if (typeof keyPrefix !== 'string' || !/^[0-9a-fA-F]+$/.test(keyPrefix)) {
    throw new Error('keyPrefix must be a non-empty hex string.');
  }
  if (keyPrefix.length > keyLength * 2) {
    throw new Error(
      `keyPrefix (${keyPrefix.length} hex characters) must not be longer than the key (keyLength: ${keyLength} bytes).`
    );
  }
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  const c = getCrypto();
  if (c?.getRandomValues) {
    c.getRandomValues(buf);
  } else {
    for (let i = 0; i < n; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Internal solver (single chain)
// ---------------------------------------------------------------------------

async function solveChain(
  challenge: Challenge,
  counterStart: number,
  counterStep: number,
  controller: AbortController,
  timeout: number,
  startTime: number
): Promise<Solution | null> {
  const { nonce, keyLength = 32, keyPrefix, salt } = challenge.parameters;
  // Fail fast: an invalid prefix would otherwise run until the timeout.
  assertKeyPrefix(keyPrefix, keyLength);
  const nonceBuf = hexToBuffer(nonce);
  const saltBuf = hexToBuffer(salt);
  // Odd-length prefixes are compared as hex strings, so match case-insensitively
  // like the byte comparison used for even-length prefixes.
  const keyPrefixHex = keyPrefix.toLowerCase();
  const keyPrefixBuf =
    keyPrefix.length % 2 === 0 ? hexToBuffer(keyPrefix) : null;

  let counter = counterStart;
  let iterations = 0;
  let lastYield = performance.now();

  while (true) {
    if (controller.signal.aborted) return null;
    if (
      timeout &&
      iterations % 10 === 0 &&
      performance.now() - startTime > timeout
    ) {
      return null;
    }

    const derived = await deriveKey(
      challenge.parameters,
      saltBuf,
      makePassword(nonceBuf, counter)
    );

    if (iterations % 10 === 0 && performance.now() - lastYield > 200) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = performance.now();
    }

    const matches = keyPrefixBuf
      ? bufferStartsWith(derived, keyPrefixBuf)
      : bufferToHex(derived).startsWith(keyPrefixHex);

    if (matches) {
      return {
        counter,
        derivedKey: bufferToHex(derived),
        time: Math.floor((performance.now() - startTime) * 10) / 10,
      };
    }

    counter += counterStep;
    iterations++;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic benchmark challenge for a given algorithm.
 * The keyPrefix is derived from `fixedCounter` so the solver always
 * finds exactly that counter — making the benchmark reproducible.
 */
export async function createBenchmarkChallenge(
  algorithm: string,
  cost: number,
  fixedCounter: number,
  keyLength: number = 32,
  memoryCost?: number,
  parallelism?: number
): Promise<Challenge> {
  const nonceBuf = randomBytes(16);
  const saltBuf = randomBytes(16);
  const parameters: ChallengeParameters = {
    algorithm,
    nonce: bufferToHex(nonceBuf),
    salt: bufferToHex(saltBuf),
    cost,
    keyLength,
    keyPrefix: '',
    ...(memoryCost !== undefined && { memoryCost }),
    ...(parallelism !== undefined && { parallelism }),
  };
  const derived = await deriveKey(
    parameters,
    saltBuf,
    makePassword(nonceBuf, fixedCounter)
  );
  parameters.keyPrefix = bufferToHex(derived);
  return { parameters };
}

/**
 * Solves a challenge using a single chain.
 */
export async function solveChallenge(
  challenge: Challenge,
  controller?: AbortController,
  timeout = 90_000
): Promise<Solution | null> {
  const ctrl = controller ?? new AbortController();
  return solveChain(challenge, 0, 1, ctrl, timeout, performance.now());
}

/**
 * Solves a challenge using multiple concurrent chains that race.
 * Each chain handles every Nth counter (chain i tries i, i+N, i+2N…).
 *
 * crypto.subtle dispatches to native background threads, so concurrent chains
 * genuinely utilise multiple CPU cores with react-native-quick-crypto.
 */
export async function solveChallengeWorkers(
  challenge: Challenge,
  concurrency: number,
  controller?: AbortController,
  timeout = 90_000
): Promise<Solution | null> {
  const n = Math.max(1, Math.round(concurrency));
  if (n === 1) return solveChallenge(challenge, controller, timeout);

  const sharedController = controller ?? new AbortController();
  const startTime = performance.now();

  const chains = Array.from({ length: n }, (_, i) =>
    solveChain(challenge, i, n, sharedController, timeout, startTime)
  );

  try {
    const solution = await Promise.race(chains);
    sharedController.abort();
    return solution;
  } catch (err) {
    sharedController.abort();
    throw err;
  }
}
