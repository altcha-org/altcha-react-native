import { Platform } from 'react-native';
import { getLocales } from 'expo-localization';

const PACKAGE_VERSION = '2.0.0';
const APP_ID = `altcha-rn/${PACKAGE_VERSION}`;

// ---------------------------------------------------------------------------
// User-Agent — ua-parser-js compatible, mirrors Flutter _buildUserAgent()
// ---------------------------------------------------------------------------

function extractVersion(raw: string | number): string {
  if (typeof raw === 'number') return String(raw);
  const m = String(raw).match(/\d+(?:\.\d+)*/);
  return m ? m[0] : String(raw);
}

function buildUserAgent(): string {
  const v = extractVersion(Platform.Version);
  switch (Platform.OS) {
    case 'android':
      return `Mozilla/5.0 (Linux; Android ${v}; React Native) ${APP_ID}`;
    case 'ios':
      return `Mozilla/5.0 (iPhone; CPU iPhone OS ${v.replace(/\./g, '_')} like Mac OS X) ${APP_ID}`;
    case 'macos':
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${v.replace(/\./g, '_')}) ${APP_ID}`;
    case 'windows':
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${APP_ID}`;
    default:
      return `Mozilla/5.0 (X11; Linux x86_64) ${APP_ID}`;
  }
}

// ---------------------------------------------------------------------------
// buildHeaders — mirrors Flutter _buildExtraHeaders()
// On web, returns {} — the browser controls User-Agent, Accept-Language and
// Client Hint headers for fetch requests.
// ---------------------------------------------------------------------------

export function buildHeaders(origin?: string): Record<string, string> {
  if (Platform.OS === 'web') return {};

  const headers: Record<string, string> = {};

  // User-Agent
  headers['User-Agent'] = buildUserAgent();

  // Accept-Language — ordered list of system locales with q-values
  const locales = getLocales();
  if (locales.length > 0) {
    const parts = locales.map((locale, i) => {
      const tag = locale.languageTag;
      if (i === 0) return tag;
      const q = Math.max(0.1, +(1.0 - i * 0.1).toFixed(1));
      return `${tag};q=${q}`;
    });
    headers['Accept-Language'] = parts.join(', ');
  }

  // sec-ch-ua-mobile — mobile platforms only
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    headers['sec-ch-ua-mobile'] = '?1';
  }

  // Origin + Referer — lets the server restrict requests by app identifier
  if (origin) {
    const normalized = origin.startsWith('https://')
      ? origin
      : `https://${origin}`;
    headers.Origin = normalized;
    headers.Referer = `${normalized}/`;
  }

  return headers;
}
