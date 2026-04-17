export { AltchaWidget, type AltchaWidgetRef } from './AltchaWidget';
export { AltchaCodeChallenge } from './AltchaCodeChallenge';
export {
  HisCollector,
  type HisCollectorOptions,
  type HisData,
} from './HisCollector';
export { defaultThemes, type AltchaTheme, type AltchaThemes } from './theme';
export { defaultTranslations, type Translation } from './i18n';
export {
  solveChallenge,
  solveChallengeWorkers,
  createBenchmarkChallenge,
  hasSubtleCrypto,
  hasScryptSupport,
  hasArgon2Support,
} from './pow';
export type {
  Algorithm,
  AltchaConfigHeader,
  Challenge,
  ChallengeConfiguration,
  ChallengeParameters,
  CodeChallenge,
  Payload,
  ServerClassification,
  ServerSignatureVerificationData,
  Solution,
} from './types';
