import { pbkdf2Sync } from 'crypto';
import { solveChallenge } from '../pow';
import { hexToBuffer } from '../helpers';
import type { ChallengeParameters } from '../types';

const nonce = '39baf91a19d671f8231217f9e28342a6';
const salt = '5e00d5d152e1a5db7d44fb6404a40a5e';

function challenge(parameters: Partial<ChallengeParameters>) {
  return {
    parameters: {
      algorithm: 'SHA-256',
      cost: 1,
      keyLength: 32,
      keyPrefix: '00',
      nonce,
      salt,
      ...parameters,
    },
  };
}

function password(counter: number) {
  const buf = Buffer.alloc(nonce.length / 2 + 4);
  Buffer.from(nonce, 'hex').copy(buf);
  buf.writeUInt32BE(counter, nonce.length / 2);
  return buf;
}

describe('solveChallenge', () => {
  // Shared vectors with altcha-lib and the altcha widget: each round hashes the full
  // digest and the key is truncated to keyLength once at the end.
  test.each([
    {
      algorithm: 'SHA-256',
      keyLength: 16,
      nonce: 'c774801f8b77dcd6b4ac5af3ddef4bf7',
      salt: 'ec872e86862dfbfba12711690a373e1d',
      counter: 555,
      expected: '0024229df5acd9a8f2cd4dfe0b074369',
    },
    {
      algorithm: 'SHA-256',
      keyLength: 64,
      nonce: 'ac5fa4c58c5be6dd7fbbcdb01faf140f',
      salt: 'b377aecf2fde853036e46a3a68cfb71a',
      counter: 791,
      expected:
        '0095329f2cd9eb0d8dce7c2a2f91a626275529c3bcbe56e0a6dafe8c83abf941',
    },
    {
      algorithm: 'SHA-384',
      keyLength: 32,
      nonce,
      salt,
      counter: 123,
      expected:
        'd54f228e73d7c198ca80bbeb113e0b44d27150c5aed3eddfcdfc97aa8a93d4ee',
    },
    {
      algorithm: 'SHA-512',
      keyLength: 32,
      nonce,
      salt,
      counter: 123,
      expected:
        '5be4ab4723e3130b92ba4264c06b9f9dccd804882fafbb169511f1959a28360a',
    },
  ])(
    'derives the same SHA key as the server libraries ($algorithm, keyLength $keyLength, cost 10)',
    async ({ expected, counter, ...parameters }) => {
      const solution = await solveChallenge(
        challenge({ ...parameters, cost: 10, keyPrefix: expected })
      );
      expect(solution).toMatchObject({ counter, derivedKey: expected });
    }
  );

  test.each([1, 20, 48, 64])(
    'derives PBKDF2 keys of any length (keyLength %i)',
    async (keyLength) => {
      const expected = pbkdf2Sync(
        password(3),
        hexToBuffer(salt),
        100,
        keyLength,
        'sha384'
      ).toString('hex');
      const solution = await solveChallenge(
        challenge({
          algorithm: 'PBKDF2/SHA-384',
          cost: 100,
          keyLength,
          keyPrefix: expected,
        })
      );
      expect(solution).toMatchObject({ counter: 3, derivedKey: expected });
    }
  );

  test.each(['SHA-1', 'sha-256', 'pbkdf2/sha-256', 'PBKDF2/SHA-1', 'MD5'])(
    'rejects an unsupported algorithm (%s)',
    async (algorithm) => {
      await expect(solveChallenge(challenge({ algorithm }))).rejects.toThrow(
        `Unsupported algorithm: ${algorithm}.`
      );
    }
  );

  test.each(['', 'z', 'zz', '-1', '0'.repeat(65)])(
    'rejects an invalid keyPrefix immediately (%p)',
    async (keyPrefix) => {
      await expect(solveChallenge(challenge({ keyPrefix }))).rejects.toThrow(
        /keyPrefix/
      );
    }
  );

  test('matches an odd-length uppercase keyPrefix case-insensitively', async () => {
    const solution = await solveChallenge(challenge({ keyPrefix: 'A' }));
    expect(solution?.derivedKey.startsWith('a')).toBe(true);
  });
});

describe('hexToBuffer', () => {
  test.each(['zz', '-1', '0x00'])('rejects non-hex input (%p)', (hex) => {
    expect(() => hexToBuffer(hex)).toThrow(
      'Hex string contains non-hex characters.'
    );
  });
});
