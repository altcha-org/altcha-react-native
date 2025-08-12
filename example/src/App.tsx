import { useRef, useState } from 'react';
import {
  Button,
  View,
  StyleSheet,
  useColorScheme,
  TextInput,
} from 'react-native';
import { AltchaWidget, defaultThemes } from 'react-native-altcha';
import { applyColorOpacity } from '../../src/helpers';
import type { AltchaWidgetRef } from '../../src/AltchaWidget';

export default function App() {
  const altchaWidgetRef = useRef<AltchaWidgetRef>(null);
  const systemColorScheme = useColorScheme() as 'light' | 'dark';
  const initialColorScheme = systemColorScheme || 'light';
  const [currentColorScheme, setCurrentMode] = useState<'light' | 'dark'>(
    initialColorScheme
  );
  const [challengeUrl, setChallengeUrl] = useState('');

  const theme = {
    ...defaultThemes[currentColorScheme],
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundColor }]}
    >
      <View style={styles.inputsContainer}>
        <TextInput
          value={challengeUrl}
          onChangeText={setChallengeUrl}
          placeholder="Challenge URL..."
          placeholderTextColor={applyColorOpacity(theme.textColor, 0.6)}
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
        challengeUrl={challengeUrl}
        colorScheme={currentColorScheme}
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
              setCurrentMode((prev) => (prev === 'light' ? 'dark' : 'light'))
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
  );
}

const styles = StyleSheet.create({
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
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  codeChallengeButtons: {
    marginTop: 10,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
