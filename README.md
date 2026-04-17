# react-native-altcha

React Native widget for [ALTCHA](https://altcha.org) — supports PoW v2 with SHA, PBKDF2, Argon2id, and Scrypt algorithms, Human Interaction Signature (HIS) collection, and server-side verification.

## Requirements

- React Native 0.75+
- Expo SDK 50+
- [`react-native-quick-crypto`](https://github.com/margelo/react-native-quick-crypto) — native crypto (required on iOS/Android)

## Benchmarks

Because of sub-optimal PBKDF2 performance in `react-native-quick-crypto` on iOS, we recommend using **Argon2id** if your project targets both platforms.

| Platform | 1 Worker | 4 Workers |
| :--- | :--- | :--- |
| Android (PBKDF2) | 7.2s (~0.4x) | 1.8s (~1.4x) |
| Android (Argon2id) | 5.0s (~1.6x) | 1.7s (~2.0x) |
| iOS (PBKDF2) | 6.3s (~0.5x) | 2.5s (~0.5x) |
| iOS (Argon2id) | 2.3s (~2.2x) | 0.9s (~2.4x) |

Measurements were taken using `PBKDF2/SHA-256` (`cost=5000, counter=5000`) and `Argon2id` (`cost=2, memoryCost=32768, counter=100`). Multipliers represent performance relative to the WebCrypto baseline on the same device.

All algorithms use `crypto.subtle` or the Node.js-style `crypto` module exposed by `react-native-quick-crypto`. On web, `SHA-*` and `PBKDF2/*` use the browser's native `crypto.subtle`.

## Installation

```sh
npm install react-native-altcha
expo install expo-audio expo-localization react-native-svg
expo install react-native-quick-crypto react-native-nitro-modules react-native-quick-base64
expo prebuild
```

### Crypto setup

Call `install()` in your app entry point **before** anything else renders. This polyfills `global.crypto` with a native C++ implementation (OpenSSL on Android, CommonCrypto on iOS):

```js
// index.js
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  require('react-native-quick-crypto').install();
}

import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
```

On web, `crypto.subtle` is available natively in the browser — no setup required.

## Basic usage

```tsx
import { useRef } from 'react';
import { AltchaWidget } from 'react-native-altcha';
import type { AltchaWidgetRef } from 'react-native-altcha';

export default function App() {
  const ref = useRef<AltchaWidgetRef>(null);

  return (
    <AltchaWidget
      ref={ref}
      challenge="..."
      onVerified={(payload) => {
        // Send payload to your backend
        console.log('Verified:', payload);
      }}
    />
  );
}
```

## Human Interaction Signature (HIS)

Some ALTCHA configurations require HIS data — touch patterns, scroll, keyboard focus — to distinguish humans from bots. The server signals this by responding to the challenge request with `{ his: { url: "..." } }` instead of a challenge.

For best coverage, attach the HIS collector at the **app root** so all touches are captured globally:

```tsx
import { useMemo } from 'react';
import { View } from 'react-native';
import { HisCollector } from 'react-native-altcha';

export default function App() {
  const hisProps = useMemo(() => HisCollector.attach(), []);

  return (
    // Spread on the outermost View — captures all touches in the subtree
    <View style={{ flex: 1 }} {...hisProps}>
      {/* your app */}
    </View>
  );
}
```

To also capture scroll events, pass `getScrollHandler()` to your `ScrollView`:

```tsx
<ScrollView
  onScroll={HisCollector.shared.getScrollHandler()}
  scrollEventThrottle={50}
>
```

## Props

### `AltchaWidget`

| Prop                   | Type                                                            | Default        | Description                                                                    |
| ---------------------- | --------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `challenge`            | `string \| Challenge`                                           | —              | URL to fetch the challenge from, or a pre-fetched Challenge object             |
| `origin`               | `string`                                                        | —              | App identifier sent as `Origin`/`Referer` headers (e.g. `"com.example.myapp"`) |
| `onVerified`           | `(payload: string) => void`                                     | **required**   | Called with base64-encoded payload on success                                  |
| `onFailed`             | `(error: string) => void`                                       | —              | Called if verification fails                                                   |
| `onServerVerification` | `(data: ServerSignatureVerificationData) => void`               | —              | Called after successful server verification                                    |
| `colorScheme`          | `'light' \| 'dark'`                                             | system         | Override color scheme                                                          |
| `themes`               | `{ light?: Partial<AltchaTheme>, dark?: Partial<AltchaTheme> }` | —              | Theme overrides                                                                |
| `style`                | `ViewStyle & { color?, fontSize? }`                             | —              | Widget container style                                                         |
| `hideLogo`             | `boolean`                                                       | `false`        | Hide the ALTCHA logo                                                           |
| `hideFooter`           | `boolean`                                                       | `false`        | Hide the "Protected by ALTCHA" footer                                          |
| `locale`               | `string`                                                        | system locale  | Language code (`'en'`, `'de'`, `'es'`, `'fr'`, `'it'`, `'pt'`)                 |
| `customTranslations`   | `Record<string, Partial<Translation>>`                          | —              | Override UI strings per locale                                                 |
| `workers`              | `number`                                                        | `1`            | Concurrent solver chains — values > 1 parallelise across CPU cores             |
| `minDuration`          | `number`                                                        | —              | Minimum solving time (ms) — pads short solves to avoid instant UI flicker      |
| `debug`                | `boolean`                                                       | `false`        | Log requests and HIS data to console                                           |
| `fetch`                | `typeof fetch`                                                  | global `fetch` | Custom fetch implementation                                                    |
| `httpHeaders`          | `Record<string, string>`                                        | —              | Extra HTTP headers added to all requests                                       |

### `AltchaWidget` ref methods

```ts
ref.current?.reset(); // Reset widget to unverified state
ref.current?.verify(); // Manually trigger verification
```

## Theming

```tsx
import { AltchaWidget, defaultThemes } from 'react-native-altcha';

<AltchaWidget
  themes={{
    light: {
      ...defaultThemes.light,
      primaryColor: '#6200ea',
      primaryContentColor: '#ffffff',
    },
    dark: {
      ...defaultThemes.dark,
      primaryColor: '#bb86fc',
    },
  }}
  challenge="..."
  onVerified={...}
/>
```

### `AltchaTheme` fields

| Field                 | Default (light) | Default (dark) |
| --------------------- | --------------- | -------------- |
| `backgroundColor`     | `#ffffff`       | `#1a1a1a`      |
| `borderColor`         | `#cccccc`       | `#444444`      |
| `primaryColor`        | `#007AFF`       | `#007AFF`      |
| `primaryContentColor` | `#ffffff`       | `#ffffff`      |
| `textColor`           | `#000000`       | `#ffffff`      |
| `errorColor`          | `#ff0000`       | `#ff0000`      |

## Internationalization

Built-in languages: **English**, **German**, **Spanish**, **French**, **Italian**, **Portuguese**.

Override individual strings:

```tsx
<AltchaWidget
  customTranslations={{
    en: { label: 'Prove you are human' },
  }}
  challenge="..."
  onVerified={...}
/>
```

## Advanced: direct solver API

```tsx
import {
  solveChallenge,
  solveChallengeWorkers,
  hasSubtleCrypto,
  hasArgon2Support,
  hasScryptSupport,
} from 'react-native-altcha';

// Single-threaded
const solution = await solveChallenge(challenge);

// Multi-threaded (N concurrent chains)
const solution = await solveChallengeWorkers(challenge, 4);
```

## Advanced: HIS collector static API

```ts
// Attach the global singleton and get root View props
const hisProps = HisCollector.attach(options?);  // { maxSamples?, sampleInterval? }

// Stop collection
HisCollector.detach();

// Access the shared instance
HisCollector.shared.export();  // { focus, pointer, scroll, touch, maxTouchPoints, time }
HisCollector.shared.getScrollHandler();  // onScroll handler for ScrollView
```

## License

MIT
