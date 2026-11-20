import {
  Keyboard,
  type EmitterSubscription,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native';

// ---------------------------------------------------------------------------
// Sample types — identical to the web collector (altcha/src/his.ts, payload v2)
// for server compatibility
// ---------------------------------------------------------------------------

/** [x, y, t, hold, offsetX, offsetY, pointerType, moves] */
type ClickSample = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** [elapsed, tabIndex, tagCode, hasInteraction] */
type FocusSample = [number, number, number, number];

/** [t, hold] */
type KeySample = [number, number];

/** [x, y, t] */
type PointerSample = [number, number, number];

/** [y, t] */
type ScrollSample = [number, number];

/** [x, y, t, pressure, radiusX, radiusY] */
type TouchSample = [number, number, number, number, number, number];

export interface HisData {
  click: ClickSample[];
  focus: FocusSample[];
  key: KeySample[];
  maxTouchPoints: number;
  pointer: PointerSample[];
  scroll: ScrollSample[];
  time: number;
  touch: TouchSample[];
  untrusted: number;
  v: 2;
  webdriver: boolean;
}

export interface HisCollectorOptions {
  maxSamples?: number;
  sampleInterval?: number;
}

export type HisRootProps = Pick<
  ViewProps,
  'onTouchStart' | 'onTouchMove' | 'onTouchEnd'
>;

const TAG_CODES: Record<string, number> = {
  INPUT: 1,
  TEXTAREA: 2,
  SELECT: 3,
  BUTTON: 4,
  A: 5,
  DETAILS: 6,
  SUMMARY: 7,
  IFRAME: 8,
  VIDEO: 9,
  AUDIO: 10,
};

/** pointerType codes; anything else is 3. */
const POINTER_TYPES: Record<string, number> = {
  mouse: 0,
  pen: 1,
  touch: 2,
};

type MeasureCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number
) => void;

/**
 * Measures a touch target. Fabric passes the host instance (has `measure`);
 * a bare node handle (number) cannot be measured, so the callback never runs.
 */
function measureTarget(target: unknown, callback: MeasureCallback): void {
  if (
    typeof target === 'object' &&
    target !== null &&
    'measure' in target &&
    typeof target.measure === 'function'
  ) {
    target.measure(callback);
  }
}

/**
 * A capped sample buffer that counts the samples added since the latest
 * `mark()`, independent of the samples' clock.
 */
class Channel<T> {
  readonly samples: T[] = [];
  private added = 0;
  private addedAtMark = 0;

  constructor(private readonly maxSamples: number) {}

  add(sample: T): void {
    this.samples.push(sample);
    this.added++;
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
  }

  mark(): void {
    this.addedAtMark = this.added;
  }

  sinceMark(): T[] {
    return this.samples.slice(
      Math.max(0, this.samples.length - (this.added - this.addedAtMark))
    );
  }
}

// ---------------------------------------------------------------------------
// HisCollector
// ---------------------------------------------------------------------------

/**
 * Collects human interaction signals for server-side bot detection.
 * Mirrors the JS widget's `Collector` class (HIS payload v2) — same export()
 * shape and same event handling logic for server compatibility.
 *
 * Web: registers DOM listeners on `document` (focusin, keydown, keyup,
 *      pointerdown, pointerup, pointermove, scroll, touchmove) — identical to
 *      the JS widget. Untrusted (script-dispatched) events are counted, not
 *      sampled.
 *
 * Native: uses onTouchStart/Move/End on the root View for click[] and touch[],
 *         Keyboard listeners for focus[], and getScrollHandler() for scroll[].
 *         pointer[] and key[] stay empty on native (no hover pointer, no
 *         global key events); untrusted is always 0, webdriver always false.
 *
 * Timestamps: click/key/pointer/touch `t` come from the event timestamp,
 * focus/scroll from `performance.now()`. The server only compares timestamps
 * within one channel.
 *
 * Usage:
 *   const hisProps = HisCollector.attach();
 *   <View style={{flex:1}} {...hisProps}>...</View>
 */
export class HisCollector {
  // ---------------------------------------------------------------------------
  // Static singleton API
  // ---------------------------------------------------------------------------

  private static _shared: HisCollector | null = null;

  static get shared(): HisCollector {
    if (!HisCollector._shared) {
      HisCollector._shared = new HisCollector();
    }
    return HisCollector._shared;
  }

  /**
   * The shared collector while the app has it attached (`HisCollector.attach()`),
   * else null. The widget exports this one instead of its own collector.
   */
  static get attachedShared(): HisCollector | null {
    return HisCollector._shared?.attached ? HisCollector._shared : null;
  }

  static attach(options?: HisCollectorOptions): HisRootProps {
    if (options) {
      HisCollector._shared?.detach();
      HisCollector._shared = new HisCollector(options);
    }
    return HisCollector.shared.attach();
  }

  static detach(): void {
    HisCollector._shared?.detach();
  }

  // ---------------------------------------------------------------------------
  // Instance state — mirrors JS Collector field for field
  // ---------------------------------------------------------------------------

  readonly maxSamples: number;
  readonly sampleInterval: number;

  private focusStartTime = 0;
  private focusInteraction = 0;
  private focusInteractionTimer?: ReturnType<typeof setTimeout>;

  private lastPointerSample = 0;
  private lastTouchSample = 0;
  private lastScrollSample = 0;

  private pendingClick: { sample: ClickSample; down: number } | null = null;
  private keysDown = new Map<string, { sample: KeySample; down: number }>();

  /** Raw (unthrottled) non-touch pointermove timestamps, newest last */
  private moveTimes: number[] = [];

  private untrusted = 0;
  private markUntrusted = 0;
  private marked = false;

  private click: Channel<ClickSample>;
  private focus: Channel<FocusSample>;
  private key: Channel<KeySample>;
  private pointer: Channel<PointerSample>;
  private scroll: Channel<ScrollSample>;
  private touch: Channel<TouchSample>;

  private keyboardShowSub: EmitterSubscription | null = null;
  private keyboardHideSub: EmitterSubscription | null = null;
  private attached = false;

  /**
   * Props for the root View (stable across attach/detach; `{}` on web, where
   * the DOM listeners already see the touches).
   */
  readonly rootProps: HisRootProps;

  constructor(options: HisCollectorOptions = {}) {
    const { maxSamples = 60, sampleInterval = 50 } = options;
    this.maxSamples = maxSamples;
    this.sampleInterval = sampleInterval;
    this.click = new Channel(maxSamples);
    this.focus = new Channel(maxSamples);
    this.key = new Channel(maxSamples);
    this.pointer = new Channel(maxSamples);
    this.scroll = new Channel(maxSamples);
    this.touch = new Channel(maxSamples);
    this.rootProps =
      typeof document !== 'undefined'
        ? {}
        : {
            onTouchStart: this.handleNativeTouchStart,
            onTouchMove: this.handleNativeTouchMove,
            onTouchEnd: this.handleNativeTouchEnd,
          };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Registers the global listeners and returns `rootProps`. Idempotent, so a
   * double-invoked render (StrictMode) does not register them twice.
   */
  attach(): HisRootProps {
    if (this.attached) return this.rootProps;
    this.attached = true;
    if (typeof document !== 'undefined') {
      // Web — capture-phase DOM listeners, matching the JS widget exactly.
      const o = { passive: true, capture: true } as const;
      document.addEventListener('focusin', this.onFocus, o);
      document.addEventListener('keydown', this.onKeyDown, o);
      document.addEventListener('keyup', this.onKeyUp, o);
      document.addEventListener('pointerdown', this.onPointerDown, o);
      document.addEventListener('pointerup', this.onPointerUp, o);
      document.addEventListener('pointermove', this.onPointer, o);
      document.addEventListener('scroll', this.onScroll, o);
      document.addEventListener('touchmove', this.onTouchMove, o);
      return this.rootProps;
    }

    // Native — keyboard events proxy for focusin
    // keyboardDidShow fires on both iOS and Android (keyboardWillShow is iOS-only)
    this.keyboardShowSub = Keyboard.addListener(
      'keyboardDidShow',
      this.onKeyboardShow
    );
    this.keyboardHideSub = Keyboard.addListener(
      'keyboardDidHide',
      this.onKeyboardHide
    );
    return this.rootProps;
  }

  detach(): void {
    this.attached = false;
    if (typeof document !== 'undefined') {
      const o = { capture: true } as const;
      document.removeEventListener('focusin', this.onFocus, o);
      document.removeEventListener('keydown', this.onKeyDown, o);
      document.removeEventListener('keyup', this.onKeyUp, o);
      document.removeEventListener('pointerdown', this.onPointerDown, o);
      document.removeEventListener('pointerup', this.onPointerUp, o);
      document.removeEventListener('pointermove', this.onPointer, o);
      document.removeEventListener('scroll', this.onScroll, o);
      document.removeEventListener('touchmove', this.onTouchMove, o);
    } else {
      this.keyboardShowSub?.remove();
      this.keyboardHideSub?.remove();
      this.keyboardShowSub = null;
      this.keyboardHideSub = null;
    }
    clearTimeout(this.focusInteractionTimer);
  }

  // ---------------------------------------------------------------------------
  // Scroll helper for ScrollViews (native)
  // ---------------------------------------------------------------------------

  getScrollHandler(horizontal = false) {
    return (event: {
      nativeEvent: { contentOffset: { x: number; y: number } };
    }) => {
      const now = performance.now();
      if (now - this.lastScrollSample < this.sampleInterval) return;
      const y = horizontal
        ? event.nativeEvent.contentOffset.x
        : event.nativeEvent.contentOffset.y;
      this.scroll.add([Math.round(y), Math.round(now)]);
      this.lastScrollSample = now;
    };
  }

  // ---------------------------------------------------------------------------
  // Export — the buffers are kept; every export() sends all retained samples
  // ---------------------------------------------------------------------------

  export(): HisData {
    return this.payload(
      this.click.samples,
      this.focus.samples,
      this.key.samples,
      this.pointer.samples,
      this.scroll.samples,
      this.touch.samples,
      this.untrusted
    );
  }

  /** Starts the window of `exportSinceMark()`; collected samples are kept. */
  mark(): void {
    this.marked = true;
    this.markUntrusted = this.untrusted;
    this.click.mark();
    this.focus.mark();
    this.key.mark();
    this.pointer.mark();
    this.scroll.mark();
    this.touch.mark();
  }

  /**
   * Same shape as `export()`, limited to samples collected since the latest
   * `mark()`. Focus `elapsed` is rebased to the first sample in the window.
   */
  exportSinceMark(): HisData {
    if (!this.marked) return this.export();
    const focus = this.focus.sinceMark();
    const first = focus[0]?.[0] ?? 0;
    return this.payload(
      this.click.sinceMark(),
      focus.map((s): FocusSample => [s[0] - first, s[1], s[2], s[3]]),
      this.key.sinceMark(),
      this.pointer.sinceMark(),
      this.scroll.sinceMark(),
      this.touch.sinceMark(),
      this.untrusted - this.markUntrusted
    );
  }

  private payload(
    click: ClickSample[],
    focus: FocusSample[],
    key: KeySample[],
    pointer: PointerSample[],
    scroll: ScrollSample[],
    touch: TouchSample[],
    untrusted: number
  ): HisData {
    const web = typeof document !== 'undefined';
    return {
      click,
      focus,
      key,
      maxTouchPoints: web ? navigator.maxTouchPoints || 0 : 5,
      pointer,
      scroll,
      time: Date.now(),
      touch,
      untrusted,
      v: 2,
      webdriver: web && navigator.webdriver === true,
    };
  }

  // ---------------------------------------------------------------------------
  // Web DOM handlers — direct ports of the JS Collector private methods
  // ---------------------------------------------------------------------------

  private onFocus = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    // Skip if a pointer press triggered this focus (focusInteraction === 2)
    if (this.focusInteraction === 2) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    const now = performance.now();
    if (this.focusStartTime === 0) this.focusStartTime = now;
    this.focus.add([
      Math.round(now - this.focusStartTime),
      (el as HTMLElement).tabIndex ?? -1,
      TAG_CODES[el.tagName] ?? 0,
      this.focusInteraction ? 1 : 0,
    ]);
  };

  private setInteraction(kind: 1 | 2): void {
    this.focusInteraction = kind;
    clearTimeout(this.focusInteractionTimer);
    this.focusInteractionTimer = setTimeout(() => {
      this.focusInteraction = 0;
    }, 100);
  }

  private onKeyDown = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    this.setInteraction(1);
    const ke = e as KeyboardEvent;
    if (ke.repeat) return;
    const now = ke.timeStamp || performance.now();
    const sample: KeySample = [Math.round(now), -1];
    this.key.add(sample);
    this.keysDown.set(ke.code, { sample, down: now });
  };

  private onKeyUp = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    const ke = e as KeyboardEvent;
    const pending = this.keysDown.get(ke.code);
    if (pending) {
      const now = ke.timeStamp || performance.now();
      pending.sample[1] = Math.round(now - pending.down);
      this.keysDown.delete(ke.code);
    }
  };

  private onPointerDown = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    this.setInteraction(2);
    const pe = e as PointerEvent;
    const now = pe.timeStamp || performance.now();
    const rect =
      pe.target instanceof Element ? pe.target.getBoundingClientRect() : null;
    let moves = 0;
    for (const t of this.moveTimes) {
      if (t >= now - 500 && t < now) moves++;
    }
    const sample: ClickSample = [
      Math.round(pe.clientX),
      Math.round(pe.clientY),
      Math.round(now),
      -1,
      rect ? Math.round(pe.clientX - (rect.left + rect.width / 2)) : 0,
      rect ? Math.round(pe.clientY - (rect.top + rect.height / 2)) : 0,
      POINTER_TYPES[pe.pointerType] ?? 3,
      moves,
    ];
    this.click.add(sample);
    this.pendingClick = { sample, down: now };
  };

  private onPointerUp = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    if (this.pendingClick) {
      const now = e.timeStamp || performance.now();
      this.pendingClick.sample[3] = Math.round(now - this.pendingClick.down);
      this.pendingClick = null;
    }
  };

  private onPointer = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    const pe = e as PointerEvent;
    // pointer[] is mouse/stylus only — skip touch pointers
    if (pe.pointerType === 'touch') return;
    const now = pe.timeStamp || performance.now();
    this.moveTimes.push(now);
    if (this.moveTimes.length > 32) this.moveTimes.shift();
    if (now - this.lastPointerSample >= this.sampleInterval) {
      this.pointer.add([
        Math.round(pe.clientX),
        Math.round(pe.clientY),
        Math.round(now),
      ]);
      this.lastPointerSample = now;
    }
  };

  private onScroll = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    const now = performance.now();
    if (now - this.lastScrollSample < this.sampleInterval) return;
    this.scroll.add([Math.round(window.scrollY), Math.round(now)]);
    this.lastScrollSample = now;
  };

  private onTouchMove = (e: Event): void => {
    if (!e.isTrusted) {
      this.untrusted++;
      return;
    }
    const te = e as TouchEvent;
    const now = te.timeStamp || performance.now();
    const t = te.touches[0];
    if (!t) return;
    if (now - this.lastTouchSample >= this.sampleInterval) {
      this.touch.add([
        Math.round(t.clientX),
        Math.round(t.clientY),
        Math.round(now),
        Math.round(t.force * 1000) / 1000,
        Math.round(t.radiusX || 0),
        Math.round(t.radiusY || 0),
      ]);
      this.lastTouchSample = now;
    }
  };

  // ---------------------------------------------------------------------------
  // Native handlers — applied to root View via HisRootProps
  // onTouchStart/Move/End propagate to ancestor Views for all touches in the
  // subtree regardless of which child claims the responder.
  //
  // touchstart/touchend map to pointerdown/pointerup (click[]), touchmove to
  // touchmove (touch[]). pointer[] stays empty — no hover pointer exists, so
  // click `moves` is always 0 (the web counts only non-touch moves too).
  // ---------------------------------------------------------------------------

  private handleNativeTouchStart = (e: GestureResponderEvent): void => {
    // Proxy for pointerdown → focusInteraction = 2
    this.setInteraction(2);
    const ne = e.nativeEvent;
    const now = ne.timestamp || performance.now();
    const sample: ClickSample = [
      Math.round(ne.pageX),
      Math.round(ne.pageY),
      Math.round(now),
      -1,
      0,
      0,
      POINTER_TYPES.touch!,
      0,
    ];
    // Offset from the touched view's center (web: target's bounding rect).
    // measure() may answer asynchronously, so the sample is patched in place.
    const { pageX, pageY } = ne;
    measureTarget(e.target, (_x, _y, width, height, left, top) => {
      sample[4] = Math.round(pageX - (left + width / 2));
      sample[5] = Math.round(pageY - (top + height / 2));
    });
    this.click.add(sample);
    this.pendingClick = { sample, down: now };
  };

  private handleNativeTouchMove = (e: GestureResponderEvent): void => {
    const t = e.nativeEvent.touches[0];
    if (!t) return;
    const now = t.timestamp || performance.now();
    if (now - this.lastTouchSample >= this.sampleInterval) {
      // Android-only field, absent from the NativeTouchEvent type
      const radius =
        'majorRadius' in t && typeof t.majorRadius === 'number'
          ? Math.round(t.majorRadius)
          : 0;
      this.touch.add([
        Math.round(t.pageX),
        Math.round(t.pageY),
        Math.round(now),
        // Android pressure may exceed 1; the web's Touch.force is 0..1
        Math.round(Math.min(1, Math.max(0, t.force ?? 0)) * 1000) / 1000,
        radius,
        radius,
      ]);
      this.lastTouchSample = now;
    }
  };

  private handleNativeTouchEnd = (e: GestureResponderEvent): void => {
    // Proxy for pointerup → click hold time
    if (this.pendingClick) {
      const now = e.nativeEvent.timestamp || performance.now();
      this.pendingClick.sample[3] = Math.round(now - this.pendingClick.down);
      this.pendingClick = null;
    }
  };

  // ---------------------------------------------------------------------------
  // Native keyboard handlers — proxy for focusin
  // ---------------------------------------------------------------------------

  private onKeyboardShow = (): void => {
    // Proxy for focusin — keyboard appears when a TextInput is focused.
    // focusInteraction was already set by handleNativeTouchStart (touch → 2)
    // or is 0 if focus was programmatic. Read it, don't set it.
    const now = performance.now();
    if (this.focusStartTime === 0) this.focusStartTime = now;
    // tagCode 1 = INPUT
    this.focus.add([
      Math.round(now - this.focusStartTime),
      -1,
      1,
      this.focusInteraction ? 1 : 0,
    ]);
  };

  private onKeyboardHide = (): void => {
    this.focusInteraction = 0;
  };
}
