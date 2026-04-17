export type Algorithm =
  | 'SHA-256'
  | 'SHA-384'
  | 'SHA-512'
  | 'PBKDF2/SHA-256'
  | 'PBKDF2/SHA-384'
  | 'PBKDF2/SHA-512'
  | 'ARGON2ID'
  | 'SCRYPT';

export interface ChallengeParameters {
  algorithm: string;
  nonce: string;
  salt: string;
  cost: number;
  keyLength: number;
  keyPrefix: string;
  keySignature?: string;
  memoryCost?: number;
  parallelism?: number;
  expiresAt?: number;
  data?: Record<string, string | number | boolean | null>;
}

/**
 * Configuration object embedded in the challenge body (`challenge.configuration`).
 * Uses camelCase keys matching the widget's own configuration interface.
 */
export interface ChallengeConfiguration {
  /** Override the server verification URL */
  verifyUrl?: string;
  /** Include timezone in server verification request */
  serverVerificationTimeZone?: boolean;
  [key: string]: unknown;
}

/**
 * Configuration object from the `x-altcha-config` response header.
 * Uses a different (lowercase / nested) key format — mapped to widget config
 * via `applyConfigHeader`.
 */
export interface AltchaConfigHeader {
  /** Override the server verification URL */
  verifyurl?: string;
  /** Sentinel options */
  sentinel?: {
    fields?: boolean;
    timeZone?: boolean;
  };
  [key: string]: unknown;
}

export interface Challenge {
  codeChallenge?: CodeChallenge;
  /** Optional configuration overrides embedded in the challenge body */
  configuration?: ChallengeConfiguration;
  parameters: ChallengeParameters;
  signature?: string;
}

export interface CodeChallenge {
  audio?: string;
  image: string;
  length?: number;
}

export interface Solution {
  counter: number;
  derivedKey: string;
  time?: number;
}

export interface Payload {
  challenge: Omit<Challenge, 'codeChallenge'>;
  solution: Solution;
}

export type ServerClassification = 'BAD' | 'GOOD' | 'NEUTRAL';

export interface ServerSignatureVerificationData {
  [key: string]: unknown;
  classification?: ServerClassification;
  email?: string;
  expire?: number;
  fields?: string[];
  fieldsHash?: string;
  id?: string;
  ipAddress?: string;
  payload?: string;
  reasons?: string[];
  score?: number;
  time?: number;
  verified: boolean;
}
