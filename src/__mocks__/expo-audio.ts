import { useState, useEffect } from 'react';

export function useAudioPlayer(source: any) {
  // Provide a simple mock "player" object
  return {
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    replace: jest.fn(),
    loop: false,
    source,
  };
}

export function useAudioPlayerStatus(player: any) {
  const [status, setStatus] = useState({
    playing: false,
    didJustFinish: false,
    duration: 0,
    position: 0,
  });

  // Simulate status updates if player.play() is called
  useEffect(() => {
    if (player && player.play.mock) {
      const originalPlay = player.play;
      player.play = (...args: any[]) => {
        setStatus({ ...status, playing: true });
        return originalPlay.apply(player, args);
      };
    }
  }, [player, status]);

  return status;
}
