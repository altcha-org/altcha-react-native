import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
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
import { applyColorOpacity } from './helpers';
import { AltchaCodeChallenge } from './AltchaCodeChallenge';
import { solveChallengeWorkers } from './pow';
import { HisCollector } from './HisCollector';
import { buildHeaders } from './headers';
import type {
  AltchaConfigHeader,
  Challenge,
  ChallengeConfiguration,
  CodeChallenge,
  ServerSignatureVerificationData,
} from './types';
import { defaultTranslations, type Translation } from './i18n';

export type AltchaWidgetRef = {
  reset: () => void;
  verify: () => Promise<void>;
};

type Status =
  | 'unverified'
  | 'verifying'
  | 'code'
  | 'verified'
  | 'expired'
  | 'error';

type Props = {
  /**
   * Challenge source: either a URL string to fetch from, or a pre-fetched Challenge object.
   */
  challenge?: Challenge | string;
  colorScheme?: 'light' | 'dark';
  customTranslations?: Record<string, Partial<Translation>>;
  debug?: boolean;
  minDuration?: number;
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
  /**
   * App identifier sent as Origin / Referer headers so the server can
   * restrict requests by app. E.g. "com.example.myapp" or "myapp.example.com".
   */
  origin?: string;
  /**
   * Number of concurrent solver chains.
   * Each chain handles a different interleaved subset of counters.
   * With react-native-quick-crypto, crypto.subtle dispatches to native threads,
   * so values > 1 can utilise multiple CPU cores.
   * @default 1
   */
  workers?: number;
};

const _fetch = fetch;

export const AltchaWidget = forwardRef(
  (
    {
      challenge: challengeProp,
      colorScheme,
      customTranslations,
      debug,
      minDuration,
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
      origin,
      workers = 1,
    }: Props,
    ref
  ) => {
    const systemColorScheme = useColorScheme() as 'light' | 'dark';
    const selectedColorScheme = colorScheme || systemColorScheme || 'light';
    const theme: AltchaTheme = {
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
    const t: Translation = {
      ...(defaultTranslations[locale as keyof typeof defaultTranslations] ||
        defaultTranslations.en),
      ...customTranslations?.[locale],
    };

    // Widget-level HIS collector — captures touches within the widget itself.
    // For global (app-wide) touch capture, the app should call
    // HisCollector.attach() and spread the returned props on its root View.
    const hisCollector = useMemo(() => new HisCollector(), []);
    const hisRootProps = useMemo(() => hisCollector.attach(), [hisCollector]);

    useEffect(() => () => hisCollector.detach(), [hisCollector]);

    const [checked, setChecked] = useState(false);
    const [codeChallenge, setCodeChallenge] = useState<
      (CodeChallenge & { payload: string }) | null
    >(null);
    const [codeChallengeCallback, setCodeChallengeCallback] = useState<
      ((code?: string) => void) | null
    >(null);
    const currentVerifyUrlRef = useRef<string | null>(null);
    const [expires, setExpires] = useState<number | null>(null);
    const [sentinelTimeZone, setSentinelTimeZone] = useState<boolean>(false);
    const [status, setStatus] = useState<Status>('unverified');

    useEffect(() => {
      const timer = expires
        ? setTimeout(() => {
            reset();
            setStatus('expired');
          }, expires)
        : null;
      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [expires]);

    React.useImperativeHandle(ref, () => ({ reset, verify }));

    const toggleCheckbox = () => {
      if (status === 'verifying' || status === 'code') return;
      if (checked) {
        reset();
      } else {
        verify();
      }
    };

    /**
     * Applies configuration from the `x-altcha-config` response header.
     * Uses lowercase/nested keys: `verifyurl`, `sentinel.timeZone`.
     */
    function applyConfigHeader(config: AltchaConfigHeader) {
      if (config.verifyurl) {
        currentVerifyUrlRef.current = constructUrl(config.verifyurl);
      }
      if (config.sentinel?.timeZone) {
        setSentinelTimeZone(true);
      }
    }

    /**
     * Applies configuration from the `configuration` property embedded in the
     * challenge body. Uses camelCase keys matching the widget's own props:
     * `verifyUrl`, `serverVerificationTimeZone`.
     */
    function applyChallengConfiguration(config: ChallengeConfiguration) {
      if (config.verifyUrl) {
        currentVerifyUrlRef.current = constructUrl(config.verifyUrl);
      }
      if (config.serverVerificationTimeZone) {
        setSentinelTimeZone(true);
      }
    }

    async function fetchChallenge(): Promise<Challenge> {
      if (challengeProp && typeof challengeProp === 'object') {
        if (challengeProp.configuration) {
          applyChallengConfiguration(challengeProp.configuration);
        }
        scheduleExpiry(challengeProp);
        return challengeProp;
      }
      const challengeUrl =
        typeof challengeProp === 'string' ? challengeProp : undefined;
      if (!challengeUrl) {
        throw new Error(
          'challenge must be set to a URL or a Challenge object.'
        );
      }
      const resp = await fetch(challengeUrl, {
        headers: { ...buildHeaders(origin), ...httpHeaders },
      });
      if (resp.status !== 200) {
        throw new Error(`Server responded with ${resp.status}.`);
      }
      const json = (await resp.json()) as Record<string, unknown>;
      if (typeof json !== 'object' || json === null) {
        throw new Error('Invalid JSON payload received.');
      }

      // Server may request HIS data before issuing a challenge
      if ('his' in json && json.his && typeof json.his === 'object') {
        const hisReq = json.his as { url: string };
        log('Server requested HIS data, submitting to', hisReq.url);
        return fetchHisChallenge(hisReq.url);
      }

      if (!('parameters' in json)) {
        throw new Error(
          'Invalid challenge received. Expected PoW v2 format with a parameters object.'
        );
      }

      // Header config applied first, challenge body config takes precedence
      const configHeader = resp.headers.get('x-altcha-config');
      if (configHeader) {
        try {
          applyConfigHeader(JSON.parse(configHeader) as AltchaConfigHeader);
        } catch {
          // noop
        }
      }

      const challenge = json as unknown as Challenge;
      if (challenge.configuration) {
        applyChallengConfiguration(challenge.configuration);
      }

      scheduleExpiry(challenge);
      return challenge;
    }

    async function fetchHisChallenge(hisUrl: string): Promise<Challenge> {
      const url = constructUrl(hisUrl);
      const hisData = hisCollector.export();
      log(
        '[HIS] submitting data:',
        JSON.stringify({
          focus: hisData.focus.length,
          pointer: hisData.pointer.length,
          scroll: hisData.scroll.length,
          touch: hisData.touch.length,
          maxTouchPoints: hisData.maxTouchPoints,
          time: hisData.time,
        })
      );
      const resp = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ his: hisData }),
        headers: {
          ...buildHeaders(origin),
          'Content-Type': 'application/json',
          ...httpHeaders,
        },
      });
      if (resp.status !== 200) {
        throw new Error(`HIS request failed with status ${resp.status}.`);
      }
      const json = (await resp.json()) as Record<string, unknown>;
      if (
        typeof json !== 'object' ||
        json === null ||
        !('parameters' in json)
      ) {
        throw new Error('Invalid challenge received from HIS endpoint.');
      }
      const challenge = json as unknown as Challenge;
      if (challenge.configuration) {
        applyChallengConfiguration(challenge.configuration);
      }
      scheduleExpiry(challenge);
      return challenge;
    }

    function scheduleExpiry(ch: Challenge) {
      const expiresAt = ch.parameters.expiresAt;
      if (expiresAt) {
        const msLeft = expiresAt * 1_000 - Date.now();
        if (msLeft > 0) setExpires(msLeft);
      }
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
      const challengeUrl =
        typeof challengeProp === 'string' ? challengeProp : undefined;
      if (challengeUrl) {
        const baseUrl = new URL(challengeUrl);
        const resultUrl = new URL(url, baseUrl.origin);
        if (!resultUrl.search) {
          resultUrl.search = baseUrl.search;
        }
        if (params) {
          for (const key in params) {
            const val = params[key];
            if (val !== undefined && val !== null) {
              resultUrl.searchParams.set(key, val);
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
      } catch (err: unknown) {
        log(err);
        setStatus('error');
      }
    }

    async function requestVerification(ch: Challenge): Promise<string | null> {
      const solution = await solveChallengeWorkers(ch, workers);
      if (!solution) return null;

      const payload = btoa(
        JSON.stringify({
          challenge: { parameters: ch.parameters, signature: ch.signature },
          solution,
        })
      );

      if (ch.codeChallenge) {
        return handleCodeChallenge(ch.codeChallenge, payload);
      } else if (currentVerifyUrlRef.current) {
        return requestServerVerification(payload);
      }
      return payload;
    }

    function handleCodeChallenge(
      cc: CodeChallenge,
      payload: string
    ): Promise<string> {
      return new Promise((resolve) => {
        setStatus('code');
        setCodeChallenge({
          ...cc,
          audio: cc.audio
            ? constructUrl(cc.audio, { language: locale })
            : undefined,
          payload,
        });
        setCodeChallengeCallback(() => resolve);
      }) as Promise<string>;
    }

    async function requestServerVerification(
      payload: string,
      code?: string
    ): Promise<string> {
      if (!currentVerifyUrlRef.current) {
        throw new Error('Parameter verifyUrl must be set.');
      }
      const resp = await fetch(currentVerifyUrlRef.current, {
        body: JSON.stringify({
          code,
          payload,
          timeZone: sentinelTimeZone ? getCalendars()[0]?.timeZone : undefined,
        }),
        headers: {
          ...buildHeaders(origin),
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
      return serverVerification.payload as string;
    }

    async function verify() {
      if (status === 'verifying') return;
      setStatus('verifying');
      try {
        const startedAt = minDuration ? Date.now() : 0;
        const ch = await fetchChallenge();
        const payload = await requestVerification(ch);
        if (minDuration) {
          const elapsed = Date.now() - startedAt;
          const remaining = minDuration - elapsed;
          if (remaining > 0) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
          }
        }
        if (payload) {
          onVerified(payload);
          setStatus('verified');
          setChecked(true);
        } else {
          reset();
        }
      } catch (err: unknown) {
        log(err);
        setStatus('error');
        onFailed?.(err instanceof Error ? err.message : String(err));
      }
    }

    return (
      <>
        <View style={[styles.container, flattenedStyle]} {...hisRootProps}>
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
                      checked && { backgroundColor: theme.primaryColor },
                    ]}
                  >
                    {checked && <CheckSvg color={theme.primaryContentColor} />}
                  </View>
                )}
              </View>
              <Text
                style={{
                  color: flattenedStyle.color,
                  fontSize: flattenedStyle.fontSize,
                }}
              >
                {codeChallenge
                  ? t.verificationRequired
                  : status === 'verifying'
                    ? t.verifying
                    : status === 'verified'
                      ? t.verified
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
              style={styles.statusContainer}
              importantForAccessibility="yes"
              accessibilityRole="alert"
              testID="error"
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color: theme.errorColor,
                    fontSize: flattenedStyle.fontSize
                      ? flattenedStyle.fontSize * 0.8
                      : undefined,
                  },
                ]}
              >
                {t.error}
              </Text>
            </View>
          )}

          {status === 'expired' && (
            <View
              style={styles.statusContainer}
              importantForAccessibility="yes"
              accessibilityRole="alert"
              testID="expired"
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color: theme.errorColor,
                    fontSize: flattenedStyle.fontSize
                      ? flattenedStyle.fontSize * 0.8
                      : undefined,
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
                    color: applyColorOpacity(
                      flattenedStyle.color!,
                      0.7
                    ) as string,
                    fontSize: flattenedStyle.fontSize
                      ? flattenedStyle.fontSize * 0.8
                      : undefined,
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
          onRequestClose={() => codeChallengeCallback?.()}
        >
          <View style={styles.codeChallengeModal}>
            <View
              style={[
                styles.codeChallengeContainer,
                {
                  backgroundColor: flattenedStyle.backgroundColor,
                  borderColor: applyColorOpacity(
                    flattenedStyle.color!,
                    0.2
                  ) as string,
                },
              ]}
            >
              {codeChallenge && (
                <AltchaCodeChallenge
                  audio={codeChallenge.audio}
                  image={codeChallenge.image}
                  codeLength={codeChallenge.length}
                  payload={codeChallenge.payload}
                  onCancel={reset}
                  onReload={() => {
                    reset();
                    setTimeout(() => verify(), 350);
                  }}
                  onSubmit={onCodeChallengeSubmit}
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: 320,
    width: '100%',
  },
  statusContainer: {
    marginTop: 8,
  },
  statusText: {
    fontSize: 14,
  },
  footerContainer: {
    marginTop: 12,
  },
  footerText: {
    textAlign: 'right',
  },
});
