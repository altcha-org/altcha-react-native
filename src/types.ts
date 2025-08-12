export type Algorithm = 'SHA-256' | 'SHA-1' | 'SHA-512';
export type Classification = 'BAD' | 'GOOD' | 'NEUTRAL';

export interface CodeChallenge {
  audio?: string;
  image: string;
  length?: number;
}

export interface Challenge {
  codeChallenge?: CodeChallenge;
  algorithm: Algorithm | string;
  challenge: string;
  maxnumber?: number;
  maxNumber?: number;
  salt: string;
  signature: string;
}

export interface Payload {
  algorithm: Algorithm;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
}

export interface ServerSignatureVerificationData {
  [key: string]: string | unknown;
  classification?: Classification;
  email?: string;
  expire: number;
  fields?: string[];
  fieldsHash?: string;
  id?: string;
  ipAddress?: string;
  payload: string;
  reasons?: string[];
  score?: number;
  time: number;
  verified: boolean;
}

export interface Solution {
  number: number;
  took: number;
}
