import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { getLocales, getCalendars } from 'expo-localization';
import { defaultThemes, type AltchaTheme } from './theme';
import { AlertSvg, AltchaLogoSvg, CheckSvg } from './svg';
import { applyColorOpacity, hashHex } from './helpers';
import { AltchaCodeChallenge } from './AltchaCodeChallenge';
import type {
  Algorithm,
  Challenge,
  CodeChallenge,
  ServerSignatureVerificationData,
  Solution,
} from './types';
import { defaultTranslations, type Translation } from './i18n';
import React from 'react';

export type AltchaWidgetRef = {
  reset: () => void;
  verify: () => Promise<void>;
};

type Props = {
  challengeJson?: Challenge;
  challengeUrl?: string;
  colorScheme?: 'light' | 'dark';
  customTranslations?: Record<string, Partial<Translation>>;
  debug?: boolean;
  delay?: number;
  fetch?: typeof fetch;
  locale?: string;
  onFailed?: (error: string) => void;
  onServerVerification?: (data: ServerSignatureVerificationData) => void;
  onVerified: (payload: string) => void;
  hideFooter?: boolean;
  hideLogo?: boolean;
  httpHeaders?: Record<string, string>;
  style?: ViewStyle & Pick<TextStyle, 'color' | 'fontSize'>;
  themes?: Partial<{
    dark?: Partial<AltchaTheme>;
    light?: Partial<AltchaTheme>;
  }>;
  verifyUrl?: string;
};

const _fetch = fetch;

export const AltchaWidget = forwardRef(
  (
    {
      challengeJson,
      challengeUrl,
      colorScheme,
      customTranslations,
      debug,
      delay,
      fetch = _fetch,
      locale = getLocales()[0]?.languageCode || 'en',
      onFailed,
      onServerVerification,
      onVerified,
      hideFooter,
      hideLogo,
      httpHeaders,
      style,
      themes = {},
      verifyUrl,
    }: Props,
    ref
  ) => {
    const systemColorScheme = useColorScheme() as 'light' | 'dark';
    const selectedColorScheme = colorScheme || systemColorScheme || 'light';
    const theme = {
      ...defaultThemes[selectedColorScheme],
      ...themes[selectedColorScheme],
    };
    const flattenedStyle = StyleSheet.flatten([
      {
        backgroundColor: theme.backgroundColor,
        borderColor: theme.borderColor,
        color: theme.textColor,
        fontSize: 16,
      } satisfies ViewStyle & Pick<TextStyle, 'color' | 'fontSize'>,
      style || {},
    ]);
    const t = {
      ...(defaultTranslations[locale as keyof typeof defaultTranslations] ||
        defaultTranslations.en),
      ...customTranslations?.[locale],
    };

    const [checked, setChecked] = useState(false);
    const [codeChallenge, setCodeChallenge] = useState<
      (CodeChallenge & { payload: string }) | null
    >(null);
    const [codeChallengeCallback, setCodeChallengeCallback] = useState<
      ((code?: string) => void) | null
    >(null);
    const currentVerifyUrlRef = useRef<string | null>(verifyUrl || null);
    const [expires, setExpires] = useState<number | null>(null);
    const [sentinelTimeZone, setSentinelTimeZone] = useState<boolean>(false);
    const [status, setStatus] = useState<
      'verifying' | 'code' | 'verified' | 'expired' | 'error' | 'unverified'
    >('unverified');

    useEffect(() => {
      const timer = expires
        ? setTimeout(() => {
            reset();
            setStatus('expired');
          }, expires * 1000)
        : null;
      return () => {
        timer && clearTimeout(timer);
      };
    }, [expires]);

    React.useImperativeHandle(ref, () => ({
      reset,
      verify,
    }));

    const toggleCheckbox = () => {
      if (status === 'verified') {
        return;
      }
      if (checked) {
        setChecked(false);
      } else {
        verify();
      }
    };

    async function fetchChallenge(): Promise<Challenge> {
      if (challengeJson) {
        return challengeJson;
      }
      if (!challengeUrl) {
        throw new Error('challengeUrl must be set.');
      }
      const resp = await fetch(challengeUrl, {
        headers: {
          ...httpHeaders,
        },
      });
      if (resp.status !== 200) {
        throw new Error(`Server responded with ${resp.status}.`);
      }
      const json = await resp.json();
      if (
        typeof json !== 'object' ||
        !('challenge' in json) ||
        !('salt' in json)
      ) {
        throw new Error('Invalid JSON payload received.');
      }
      const salt: string = json.salt;
      const params = new URLSearchParams(salt.split('?')[1] || '');
      if (params.has('expires')) {
        const timestamp = parseInt(params.get('expires') || '0', 10);
        if (timestamp) {
          setExpires(timestamp * 1000 - Date.now());
        }
      }
      const configHeader = resp.headers.get('x-altcha-config');
      if (configHeader) {
        try {
          const config = JSON.parse(configHeader);
          if (config && typeof config === 'object') {
            if (config.verifyurl) {
              currentVerifyUrlRef.current = constructUrl(config.verifyurl);
            }
            if (config.sentinel?.timeZone) {
              setSentinelTimeZone(true);
            }
          }
        } catch {
          // noop
        }
      }
      return json;
    }

    function log(...args: unknown[]) {
      if (debug || args.some((a) => a instanceof Error)) {
        console[args[0] instanceof Error ? 'error' : 'log'](
          '[ALTCHA]',
          ...args
        );
      }
    }

    function reset() {
      setCodeChallenge(null);
      setChecked(false);
      setExpires(null);
      setStatus('unverified');
    }

    function constructUrl(
      url: string,
      params?: Record<string, string | undefined | null>
    ) {
      if (challengeUrl) {
        const baseUrl = new URL(challengeUrl);
        const resultUrl = new URL(url, baseUrl.origin);
        if (!resultUrl.search) {
          resultUrl.search = baseUrl.search;
        }
        if (params) {
          for (const key in params) {
            if (params[key] !== undefined && params[key] !== null) {
              resultUrl.searchParams.set(key, params[key]);
            }
          }
        }
        return resultUrl.toString();
      }
      return url;
    }

    async function onCodeChallengeSubmit(payload: string, code: string) {
      setCodeChallenge(null);
      try {
        const serverPayload = await requestServerVerification(payload, code);
        codeChallengeCallback?.(serverPayload);
      } catch (err: any) {
        log(err);
        setStatus('error');
      }
    }

    async function requestVerification(challenge: Challenge) {
      const { promise } = solveChallenge(
        challenge.challenge,
        challenge.salt,
        challenge.algorithm as Algorithm,
        challenge.maxnumber || challenge.maxNumber
      );
      const solution = await promise;
      if (solution) {
        const payloadObject = {
          algorithm: challenge.algorithm,
          challenge: challenge.challenge,
          number: solution.number,
          salt: challenge.salt,
          signature: challenge.signature,
          took: solution.took,
        };
        const payload = btoa(JSON.stringify(payloadObject));
        if (challenge.codeChallenge) {
          const _codeChallenge = challenge.codeChallenge;
          return new Promise((resolve) => {
            setStatus('code');
            setCodeChallenge({
              ..._codeChallenge,
              audio:
                _codeChallenge.audio &&
                constructUrl(_codeChallenge.audio, {
                  language: locale,
                }),
              payload,
            });
            setCodeChallengeCallback(() => resolve);
          }) as Promise<string>;
        } else if (currentVerifyUrlRef.current) {
          return requestServerVerification(payload);
        }
        return payload;
      }
      return null;
    }

    async function requestServerVerification(payload: string, code?: string) {
      if (!currentVerifyUrlRef.current) {
        throw new Error('Parameter verifyUrl must be set.');
      }
      if (!payload) {
        throw new Error('Payload is not set.');
      }
      const resp = await fetch(currentVerifyUrlRef.current, {
        body: JSON.stringify({
          code,
          payload,
          timeZone: sentinelTimeZone ? getCalendars()[0]?.timeZone : undefined,
        }),
        headers: {
          'Content-Type': 'application/json',
          ...httpHeaders,
        },
        method: 'POST',
      });
      if (resp.status !== 200) {
        throw new Error(
          `Server verification failed with status ${resp.status}.`
        );
      }
      const serverVerification: ServerSignatureVerificationData =
        await resp.json();
      onServerVerification?.(serverVerification);
      if (!serverVerification.verified) {
        throw new Error('Server verification failed.');
      }
      return serverVerification.payload;
    }

    async function verify() {
      if (status === 'verifying') {
        return;
      }
      setStatus('verifying');
      try {
        if (delay) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const challenge = await fetchChallenge();
        const payload = await requestVerification(challenge);
        if (payload) {
          onVerified(payload);
          setStatus('verified');
          setChecked(true);
        } else {
          reset();
        }
      } catch (err: any) {
        log(err);
        setStatus('error');
        onFailed?.(String(err.message || err));
      }
    }

    function solveChallenge(
      challenge: string,
      salt: string,
      algorithm: Algorithm = 'SHA-256',
      max: number = 1e6,
      start: number = 0
    ): { promise: Promise<Solution | null>; controller: AbortController } {
      const controller = new AbortController();
      const startTime = Date.now();
      const fn = async (): Promise<Solution | null> => {
        for (let n = start; n <= max; n += 1) {
          if (controller.signal.aborted) {
            return null;
          }
          const hash = await hashHex(algorithm, salt + n);
          if (hash === challenge) {
            return {
              number: n,
              took: Date.now() - startTime,
            };
          }
          // Yield control periodically to prevent blocking the main thread
          if (n % 1000 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
        return null;
      };
      return {
        promise: fn(),
        controller,
      };
    }

    return (
      <>
        <View style={[styles.container, flattenedStyle]}>
          <View style={styles.topRow}>
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={toggleCheckbox}
              disabled={status === 'verifying'}
              accessibilityRole="checkbox"
              accessibilityLabel={t.label}
              importantForAccessibility="yes"
              testID="checkbox"
            >
              <View style={styles.checkboxWrap}>
                {status === 'verifying' ? (
                  <ActivityIndicator size="small" color={theme.primaryColor} />
                ) : status === 'code' ? (
                  <View style={styles.alertIcon}>
                    <AlertSvg color={flattenedStyle.color!} />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: theme.primaryColor },
                      checked &&
                        styles.checkboxChecked && {
                          backgroundColor: theme.primaryColor,
                        },
                    ]}
                  >
                    {checked && <CheckSvg color={theme.primaryContentColor} />}
                  </View>
                )}
              </View>
              <Text
                style={[
                  {
                    color: flattenedStyle.color,
                    fontSize: flattenedStyle.fontSize,
                  },
                ]}
              >
                {codeChallenge
                  ? t.verificationRequired
                  : status === 'verifying'
                    ? t.verifying
                    : t.label}
              </Text>
            </TouchableOpacity>

            {hideLogo !== true && (
              <View testID="logo">
                <AltchaLogoSvg color={flattenedStyle.color!} />
              </View>
            )}
          </View>

          {status === 'error' && (
            <View
              style={styles.errorContainer}
              importantForAccessibility="yes"
              accessibilityRole="alert"
              testID="error"
            >
              <Text
                style={[
                  styles.errorText,
                  {
                    color: theme.errorColor,
                    fontSize:
                      flattenedStyle.fontSize && flattenedStyle.fontSize * 0.8,
                  },
                ]}
              >
                {t.error}
              </Text>
            </View>
          )}

          {status === 'expired' && (
            <View
              style={styles.errorContainer}
              importantForAccessibility="yes"
              accessibilityRole="alert"
            >
              <Text
                style={[
                  styles.errorText,
                  {
                    color: theme.errorColor,
                    fontSize:
                      flattenedStyle.fontSize && flattenedStyle.fontSize * 0.8,
                  },
                ]}
              >
                {t.expired}
              </Text>
            </View>
          )}

          {hideFooter !== true && (
            <View style={styles.footerContainer} testID="footer">
              <Text
                style={[
                  styles.footerText,
                  {
                    color: applyColorOpacity(flattenedStyle.color!, 0.7),
                    fontSize:
                      flattenedStyle.fontSize && flattenedStyle.fontSize * 0.8,
                  },
                ]}
                importantForAccessibility="no-hide-descendants"
              >
                {t.footer}
              </Text>
            </View>
          )}
        </View>

        <Modal
          animationType="slide"
          transparent={true}
          visible={!!codeChallenge}
          onRequestClose={() => {
            codeChallengeCallback?.();
          }}
        >
          <View style={[styles.codeChallengeModal]}>
            <View
              style={[
                styles.codeChallengeContainer,
                {
                  backgroundColor: flattenedStyle.backgroundColor,
                  borderColor: applyColorOpacity(flattenedStyle.color!, 0.2),
                },
              ]}
            >
              {codeChallenge && (
                <AltchaCodeChallenge
                  audio={codeChallenge.audio}
                  image={codeChallenge.image}
                  codeLength={codeChallenge.length}
                  payload={codeChallenge.payload}
                  onCancel={() => {
                    reset();
                  }}
                  onReload={() => {
                    reset();
                    // call verify after a short delay to account for animations
                    setTimeout(() => verify(), 350);
                  }}
                  onSubmit={(payload, code) => {
                    onCodeChallengeSubmit(payload, code);
                  }}
                  t={t}
                  theme={theme}
                />
              )}
            </View>
          </View>
        </Modal>
      </>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    width: 260,
    backgroundColor: '#fff',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxWrap: {
    marginRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
  },
  alertIcon: {
    width: 20,
    height: 20,
  },
  codeChallengeModal: {
    flexGrow: 1,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeChallengeContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderColor: '#000',
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: 320,
    width: '100%',
  },
  errorContainer: {
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
  },
  footerContainer: {
    marginTop: 12,
  },
  footerText: {
    textAlign: 'right',
  },
});
