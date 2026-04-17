export const useAudioPlayer = () => ({
  playing: false,
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(),
  replace: jest.fn(),
});

export const useAudioPlayerStatus = () => ({
  playing: false,
  duration: null,
});
