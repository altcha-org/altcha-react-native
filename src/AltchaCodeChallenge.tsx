import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Alert,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AudioSvg, AudioStopSvg, ReloadSvg } from './svg';
import { applyColorOpacity } from './helpers';
import type { AltchaTheme } from './theme';
import type { Translation } from './i18n';

type Props = {
  audio?: string;
  codeLength?: number;
  image: string;
  payload: string;
  onCancel?: () => void;
  onReload?: () => Promise<void> | void;
  onSubmit: (payload: string, code: string) => void;
  t: Translation;
  theme: AltchaTheme;
};

export const AltchaCodeChallenge = ({
  audio,
  codeLength,
  image,
  payload,
  theme,
  onCancel,
  onReload,
  onSubmit,
  t,
}: Props) => {
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  const inputRef = useRef<TextInput>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [currentAudioUri, setCurrentAudioUri] = useState<string | null>(null);
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    return () => {
      if (
        isAudioLoading &&
        playerStatus.duration !== null &&
        playerStatus.playing
      ) {
        setIsAudioLoading(false);
      }
    };
  }, [isAudioLoading, playerStatus]);

  async function fetchAudioAsDataUrl(): Promise<string> {
    if (!audio) {
      throw new Error('Audio if not available.');
    }
    const resp = await fetch(audio);
    if (resp.status !== 200) {
      throw new Error(`Server responded with ${resp.status}.`);
    }
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  function onAudioPress() {
    if (player.playing) {
      setIsAudioLoading(false);
      player.pause();
    } else if (audio) {
      setIsAudioLoading(true);
      if (currentAudioUri !== audio) {
        setCurrentAudioUri(audio);
        fetchAudioAsDataUrl().then((uri) => {
          player.replace({
            uri: uri,
          });
          player.play();
        });
      } else {
        player.seekTo(0);
        player.play();
      }
    }
  }

  function onVerifyPress() {
    const codeTrimmed = code.trim();
    if (!codeTrimmed) {
      inputRef?.current?.focus();
      Alert.alert(t.enterCode);
      return;
    }
    onSubmit(payload, codeTrimmed);
    Keyboard.dismiss();
  }

  return (
    <View style={styles.container} accessibilityLabel={t.enterCode}>
      <View
        style={[
          styles.imageContainer,
          {
            borderColor: theme.borderColor,
          },
        ]}
      >
        <Image
          source={{
            uri: image,
          }}
          style={styles.image}
          resizeMode="contain"
          accessibilityRole="image"
        />
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={setCode}
          placeholder={t.enterCode}
          placeholderTextColor={applyColorOpacity(theme.textColor, 0.6)}
          style={[
            styles.input,
            {
              borderColor: theme.borderColor,
              color: theme.textColor,
            },
          ]}
          maxLength={codeLength}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={true}
          returnKeyType="done"
          accessibilityLabel={t.enterCodeAria}
          importantForAccessibility="yes"
          onSubmitEditing={onVerifyPress}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === ' ') {
              onAudioPress();
            }
          }}
        />
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              borderColor: theme.borderColor,
            },
          ]}
          onPress={onAudioPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t.getAudioChallenge}
        >
          {isAudioLoading ? (
            <ActivityIndicator size="small" color={theme.textColor} />
          ) : playerStatus.playing ? (
            <AudioStopSvg color={theme.textColor} />
          ) : (
            <AudioSvg color={theme.textColor} />
          )}
        </TouchableOpacity>

        {onReload && (
          <TouchableOpacity
            style={[
              styles.iconButton,
              {
                borderColor: theme.borderColor,
              },
            ]}
            onPress={onReload}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t.reload}
          >
            <ReloadSvg color={theme.textColor} />
          </TouchableOpacity>
        )}
      </View>

      <View>
        <View>
          <TouchableOpacity
            style={[styles.verifyButton]}
            onPress={onVerifyPress}
            accessibilityRole="button"
          >
            <Text style={styles.verifyText}>{t.verify}</Text>
          </TouchableOpacity>
        </View>

        {onCancel && (
          <View style={styles.cancelButtonContainer}>
            <TouchableOpacity
              style={[styles.cancelButton]}
              onPress={() => {
                onCancel?.();
              }}
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  {
                    color: theme.textColor,
                  },
                ]}
              >
                {t.cancel}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
  },
  imageContainer: {
    backgroundColor: '#fff',
    borderColor: '#ddd',
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  image: {
    width: 180,
    height: 60,
    backgroundColor: '#ffffff',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconButton: {
    borderColor: '#ddd',
    borderRadius: 5,
    borderWidth: 1,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  inputContainer: {
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  verifyButton: {
    marginTop: 12,
    backgroundColor: '#007AFF',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButtonContainer: {
    marginTop: 24,
  },
  cancelButton: {
    opacity: 0.7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
  },
  errorText: {
    marginTop: 8,
    color: '#b00020',
  },
});
