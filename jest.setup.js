jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', countryCode: 'US', isRTL: false }],
  getCalendars: () => [{ calendar: 'gregorian', timeZone: 'America/New_York', firstWeekday: 1 }],
}));

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    playing: false,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    replace: jest.fn(),
  }),
  useAudioPlayerStatus: () => ({ playing: false, duration: null }),
}));
