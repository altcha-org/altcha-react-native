import { useRef, useState, useMemo } from 'react';
import {
  Button,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  TextInput,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AltchaWidget, defaultThemes } from 'react-native-altcha';
import { HisCollector } from '../../src/HisCollector';
import { applyColorOpacity } from '../../src/helpers';
import type { AltchaWidgetRef } from '../../src/AltchaWidget';
import { BenchmarkScreen } from './BenchmarkScreen';

type Screen = 'main' | 'benchmark';

export default function App() {
  // Attach HIS collector at the app root for global touch + keyboard capture.
  // Spread hisProps on the outermost View so onTouchMove fires for all
  // touches in the app regardless of which child claims the responder.
  const hisProps = useMemo(() => HisCollector.attach(), []);

  const altchaWidgetRef = useRef<AltchaWidgetRef>(null);
  const systemColorScheme = useColorScheme() as 'light' | 'dark';
  const [currentColorScheme, setCurrentColorScheme] = useState<
    'light' | 'dark'
  >(systemColorScheme || 'light');
  const [screen, setScreen] = useState<Screen>('main');
  const [challengeUrl, setChallengeUrl] = useState('');

  const theme = { ...defaultThemes[currentColorScheme] };

  if (screen === 'benchmark') {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={[styles.container, { backgroundColor: theme.backgroundColor }]}
          {...hisProps}
        >
          <BenchmarkScreen theme={theme} onBack={() => setScreen('main')} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.backgroundColor }]}
        {...hisProps}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>
            ALTCHA Widget
          </Text>
          <TouchableOpacity onPress={() => setScreen('benchmark')}>
            <Text style={[styles.headerLink, { color: theme.primaryColor }]}>
              Benchmark
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.inputsContainer}>
            <TextInput
              value={challengeUrl}
              onChangeText={setChallengeUrl}
              placeholder="Challenge URL..."
              placeholderTextColor={
                applyColorOpacity(theme.textColor, 0.6) as string
              }
              style={[
                styles.input,
                {
                  borderColor: theme.borderColor,
                  color: theme.textColor,
                },
              ]}
            />
          </View>

          <AltchaWidget
            ref={altchaWidgetRef}
            challenge={challengeUrl}
            colorScheme={currentColorScheme}
            origin="com.example.altcha"
            debug
            onServerVerification={(data) => {
              console.log('Server verification:', data);
            }}
            onVerified={(payload) => {
              console.log('Verified:', payload);
            }}
          />

          <View style={styles.buttonsContainer}>
            <View style={styles.button}>
              <Button
                title="Toggle Theme"
                onPress={() =>
                  setCurrentColorScheme((prev) =>
                    prev === 'light' ? 'dark' : 'light'
                  )
                }
              />
            </View>
            <View style={styles.button}>
              <Button
                title="Reset"
                onPress={() => altchaWidgetRef?.current?.reset()}
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerLink: {
    fontSize: 15,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputsContainer: {
    marginBottom: 20,
    maxWidth: 420,
    paddingHorizontal: 12,
    width: '100%',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    width: '100%',
  },
  buttonsContainer: {
    marginTop: 20,
  },
  button: {
    marginBottom: 12,
  },
});
