import {
  Keyboard,
  type EmitterSubscription,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native';

// ---------------------------------------------------------------------------
// Sample types — identical to the web collector for server compatibility
// ---------------------------------------------------------------------------

/** [elapsed, tabIndex, tagCode, hasInteraction] */
type FocusSample = [number, number, number, number];

/** [x, y, t] */
type PointerSample = [number, number, number];

/** [y, t] */
type ScrollSample = [number, number];

/** [x, y, t, pressure, radiusX, radiusY] */
type TouchSample = [number, number, number, number, number, number];

export interface HisData {
  focus: FocusSample[];
  maxTouchPoints: number;
  pointer: PointerSample[];
  scroll: ScrollSample[];
  time: number;
  touch: TouchSample[];
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

// ---------------------------------------------------------------------------
// HisCollector
// ---------------------------------------------------------------------------

/**
 * Collects human interaction signals for server-side bot detection.
 * Mirrors the JS widget's `Collector` class exactly — same export() shape
 * and same event handling logic for server compatibility.
 *
 * Web: registers DOM listeners on `document` (pointermove, touchmove,
 *      pointerdown, keydown, scroll, focusin) — identical to the JS widget's
 *      window.addEventListener approach.
 *
 * Native: uses onTouchStart/Move on the root View for touch[], Keyboard
 *         listeners for focus[], and getScrollHandler() for scroll[].
 *         pointer[] stays empty on native (no separate pointer device).
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

  static attach(options?: HisCollectorOptions): HisRootProps {
    if (options) {
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
  private focusInteractionTimer: ReturnType<typeof setTimeout> | null = null;

  private lastPointerSample = 0; // separate from touch
  private lastTouchSample = 0;
  private lastScrollSample = 0;

  private pendingPointer: PointerSample | null = null; // separate from touch
  private pendingTouch: TouchSample | null = null;

  private focus: FocusSample[] = [];
  private pointer: PointerSample[] = [];
  private scroll: ScrollSample[] = [];
  private touch: TouchSample[] = [];

  private keyboardShowSub: EmitterSubscription | null = null;
  private keyboardHideSub: EmitterSubscription | null = null;

  constructor(options: HisCollectorOptions = {}) {
    const { maxSamples = 60, sampleInterval = 50 } = options;
    this.maxSamples = maxSamples;
    this.sampleInterval = sampleInterval;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  attach(): HisRootProps {
    if (typeof document !== 'undefined') {
      // Web — six capture-phase listeners, matching the JS widget exactly
      const o = { passive: true, capture: true } as const;
      document.addEventListener('focusin', this.onFocus, o);
      document.addEventListener('keydown', this.onInteraction, o);
      document.addEventListener('pointerdown', this.onInteraction, o);
      document.addEventListener('pointermove', this.onPointer, o);
      document.addEventListener('scroll', this.onScroll, o);
      document.addEventListener('touchmove', this.onTouchMove, o);
    } else {
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
    }

    return {
      onTouchStart: this.handleNativeTouchStart,
      onTouchMove: this.handleNativeTouchMove,
      onTouchEnd: this.handleNativeTouchEnd,
    };
  }

  detach(): void {
    if (typeof document !== 'undefined') {
      const o = { capture: true } as const;
      document.removeEventListener('focusin', this.onFocus, o);
      document.removeEventListener('keydown', this.onInteraction, o);
      document.removeEventListener('pointerdown', this.onInteraction, o);
      document.removeEventListener('pointermove', this.onPointer, o);
      document.removeEventListener('scroll', this.onScroll, o);
      document.removeEventListener('touchmove', this.onTouchMove, o);
    } else {
      this.keyboardShowSub?.remove();
      this.keyboardHideSub?.remove();
      this.keyboardShowSub = null;
      this.keyboardHideSub = null;
    }
    if (this.focusInteractionTimer) {
      clearTimeout(this.focusInteractionTimer);
      this.focusInteractionTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Scroll helper for ScrollViews (native)
  // ---------------------------------------------------------------------------

  getScrollHandler(horizontal = false) {
    return (event: {
      nativeEvent: { contentOffset: { x: number; y: number } };
    }) => {
      const now = Date.now();
      if (now - this.lastScrollSample < this.sampleInterval) return;
      const y = horizontal
        ? Math.round(event.nativeEvent.contentOffset.x)
        : Math.round(event.nativeEvent.contentOffset.y);
      this.scroll.push([y, now]);
      this.lastScrollSample = now;
      this.evict(this.scroll);
    };
  }

  // ---------------------------------------------------------------------------
  // Export — returns arrays as-is, no flushing (matches JS Collector exactly)
  // ---------------------------------------------------------------------------

  export(): HisData {
    return {
      focus: this.focus,
      maxTouchPoints:
        typeof document !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 5,
      pointer: this.pointer,
      scroll: this.scroll,
      time: Date.now(),
      touch: this.touch,
    };
  }

  // ---------------------------------------------------------------------------
  // Web DOM handlers — direct ports of the JS Collector private methods
  // ---------------------------------------------------------------------------

  private onFocus = (e: Event): void => {
    // Skip if a mouse click triggered this focus (focusInteraction === 2)
    if (this.focusInteraction === 2) return;
    const el = e.target as HTMLElement | null;
    if (!el || !(el instanceof Element)) return;
    const now = Date.now();
    if (this.focusStartTime === 0) this.focusStartTime = now;
    this.focus.push([
      Math.round(now - this.focusStartTime),
      (el as HTMLElement).tabIndex ?? -1,
      TAG_CODES[el.tagName] ?? 0,
      this.focusInteraction ? 1 : 0,
    ]);
    this.evict(this.focus);
  };

  private onInteraction = (e: Event): void => {
    // keydown → 1, pointerdown → 2  (matches: 'keyCode' in e ? 1 : 2)
    this.focusInteraction = 'keyCode' in e ? 1 : 2;
    if (this.focusInteractionTimer) clearTimeout(this.focusInteractionTimer);
    this.focusInteractionTimer = setTimeout(() => {
      this.focusInteraction = 0;
      this.focusInteractionTimer = null;
    }, 100);
  };

  private onPointer = (e: Event): void => {
    const pe = e as PointerEvent;
    // pointer[] is mouse/stylus only — skip touch pointers
    if (pe.pointerType === 'touch') return;
    const now = pe.timeStamp || Date.now();
    this.pendingPointer = [
      Math.round(pe.clientX),
      Math.round(pe.clientY),
      Math.round(now),
    ];
    if (now - this.lastPointerSample >= this.sampleInterval) {
      this.pointer.push(this.pendingPointer);
      this.lastPointerSample = now;
      this.pendingPointer = null;
      this.evict(this.pointer);
    }
  };

  private onScroll = (): void => {
    const now = Date.now();
    if (now - this.lastScrollSample < this.sampleInterval) return;
    this.scroll.push([Math.round(window.scrollY), now]);
    this.lastScrollSample = now;
    this.evict(this.scroll);
  };

  private onTouchMove = (e: Event): void => {
    const te = e as TouchEvent;
    const now = te.timeStamp || Date.now();
    const t = te.touches[0];
    if (!t) return;
    this.pendingTouch = [
      Math.round(t.clientX),
      Math.round(t.clientY),
      Math.round(now),
      Math.round(t.force * 1000) / 1000,
      Math.round((t as Touch & { radiusX?: number }).radiusX || 0),
      Math.round((t as Touch & { radiusY?: number }).radiusY || 0),
    ];
    if (now - this.lastTouchSample >= this.sampleInterval) {
      this.touch.push(this.pendingTouch);
      this.lastTouchSample = now;
      this.pendingTouch = null;
      this.evict(this.touch);
    }
  };

  // ---------------------------------------------------------------------------
  // Native handlers — applied to root View via HisRootProps
  // onTouchStart/Move/End propagate to ancestor Views for all touches in the
  // subtree regardless of which child claims the responder.
  //
  // pointer[] stays empty on native — no separate pointer device exists.
  // touch[] maps to touchmove equivalent.
  // ---------------------------------------------------------------------------

  private handleNativeTouchStart = (_event: GestureResponderEvent): void => {
    // Proxy for pointerdown → focusInteraction = 2
    this.focusInteraction = 2;
    if (this.focusInteractionTimer) clearTimeout(this.focusInteractionTimer);
    this.focusInteractionTimer = setTimeout(() => {
      this.focusInteraction = 0;
      this.focusInteractionTimer = null;
    }, 100);
  };

  private handleNativeTouchMove = (e: GestureResponderEvent): void => {
    const now = Date.now();
    const t = e.nativeEvent.touches[0];
    if (!t) return;
    this.pendingTouch = [
      Math.round(t.pageX),
      Math.round(t.pageY),
      now,
      Math.round((t.force ?? 0) * 1000) / 1000,
      Math.round((t as unknown as { majorRadius?: number }).majorRadius ?? 0),
      Math.round((t as unknown as { majorRadius?: number }).majorRadius ?? 0),
    ];
    if (now - this.lastTouchSample >= this.sampleInterval) {
      this.touch.push(this.pendingTouch);
      this.lastTouchSample = now;
      this.pendingTouch = null;
      this.evict(this.touch);
    }
  };

  private handleNativeTouchEnd = (_event: GestureResponderEvent): void => {
    // Flush pending touch sample on finger lift (mirrors web's implicit flush
    // when the next sampleInterval boundary is crossed)
    if (this.pendingTouch) {
      this.touch.push(this.pendingTouch);
      this.pendingTouch = null;
      this.evict(this.touch);
    }
  };

  // ---------------------------------------------------------------------------
  // Native keyboard handlers — proxy for focusin + keydown
  // ---------------------------------------------------------------------------

  private onKeyboardShow = (): void => {
    // Proxy for focusin — keyboard appears when a TextInput is focused.
    // focusInteraction was already set by handleNativeTouchStart (touch → 2)
    // or is 0 if focus was programmatic. Read it, don't set it.
    const now = Date.now();
    if (this.focusStartTime === 0) this.focusStartTime = now;
    // tagCode 1 = INPUT
    this.focus.push([
      Math.round(now - this.focusStartTime),
      -1,
      1,
      this.focusInteraction ? 1 : 0,
    ]);
    this.evict(this.focus);
  };

  private onKeyboardHide = (): void => {
    this.focusInteraction = 0;
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private evict<T extends number[]>(buffer: T[]): void {
    if (buffer.length > this.maxSamples) {
      buffer.splice(0, buffer.length - this.maxSamples);
    }
  }
}
