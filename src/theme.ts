export type AltchaTheme = {
  backgroundColor: string;
  borderColor: string;
  errorColor: string;
  primaryColor: string;
  primaryContentColor: string;
  textColor: string;
};

export type AltchaThemes = {
  light: AltchaTheme;
  dark: AltchaTheme;
};

export const defaultThemes: AltchaThemes = {
  light: {
    backgroundColor: '#ffffff',
    borderColor: '#cccccc',
    errorColor: '#ff0000',
    primaryColor: '#007AFF',
    primaryContentColor: '#ffffff',
    textColor: '#000000',
  },
  dark: {
    backgroundColor: '#1a1a1a',
    borderColor: '#444444',
    errorColor: '#ff0000',
    primaryColor: '#007AFF',
    primaryContentColor: '#ffffff',
    textColor: '#ffffff',
  },
};
