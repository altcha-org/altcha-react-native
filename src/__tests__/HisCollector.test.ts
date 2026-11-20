import type { GestureResponderEvent } from 'react-native';
import { HisCollector, type HisRootProps } from '../HisCollector';

type Touch = { pageX: number; pageY: number; timestamp: number };

function touchEvent(
  touch: Touch,
  target: unknown = null
): GestureResponderEvent {
  return {
    nativeEvent: { ...touch, touches: [touch], changedTouches: [touch] },
    target,
  } as unknown as GestureResponderEvent;
}

function tap(props: HisRootProps, t: number, hold: number, target?: unknown) {
  props.onTouchStart!(
    touchEvent({ pageX: 10, pageY: 20, timestamp: t }, target)
  );
  props.onTouchEnd!(touchEvent({ pageX: 10, pageY: 20, timestamp: t + hold }));
}

describe('HisCollector (native)', () => {
  let collector: HisCollector;

  afterEach(() => collector.detach());

  it('records a tap as a touch click with hold time and target offset', () => {
    collector = new HisCollector();
    const props = collector.attach();
    // View at (0, 0) sized 40x30: center (20, 15); the tap at (10, 20) is off by (-10, 5).
    const target = {
      measure: (cb: (...args: number[]) => void) => cb(0, 0, 40, 30, 0, 0),
    };
    tap(props, 1000, 85, target);
    const data = collector.export();
    expect(data.v).toBe(2);
    expect(data.click).toEqual([[10, 20, 1000, 85, -10, 5, 2, 0]]);
    expect(data.untrusted).toBe(0);
    expect(data.webdriver).toBe(false);
  });

  it('exportSinceMark returns only samples after mark, export keeps all', () => {
    collector = new HisCollector({ maxSamples: 3 });
    const props = collector.attach();
    tap(props, 100, 50);
    tap(props, 200, 50);
    collector.mark();
    tap(props, 300, 50);
    tap(props, 400, 50);
    expect(collector.exportSinceMark().click.map((c) => c[2])).toEqual([
      300, 400,
    ]);
    // Eviction drops pre-mark samples first; the window never exceeds the buffer.
    tap(props, 500, 50);
    tap(props, 600, 50);
    expect(collector.export().click.map((c) => c[2])).toEqual([400, 500, 600]);
    expect(collector.exportSinceMark().click.map((c) => c[2])).toEqual([
      400, 500, 600,
    ]);
  });
});
