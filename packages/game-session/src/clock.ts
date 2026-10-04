/**
 * Game clock with injected timer for testability.
 * Tracks remaining ms per side; flags the side whose time runs out.
 */

export interface TimeControlMs {
  /** Starting budget per side. */
  initialMs: number;
  /** Fischer increment added after each completed move. */
  incrementMs: number;
}

export interface ClockState {
  running: boolean;
  activeSide: 'w' | 'b' | null;
  remainingW: number;
  remainingB: number;
}

export interface ClockHandlers {
  onTick?(state: ClockState): void;
  onFlag(side: 'w' | 'b'): void;
}

const TICK_MS = 100;

export class GameClock {
  private remaining: Record<'w' | 'b', number>;
  private activeSide: 'w' | 'b' | null = null;
  private lastStamp = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flagged = false;
  private pausedRemaining: ClockState | null = null;

  constructor(
    private tc: TimeControlMs,
    private handlers: ClockHandlers,
    private setIntervalFn: typeof setInterval = setInterval.bind(globalThis),
    private clearIntervalFn: typeof clearInterval = clearInterval.bind(globalThis),
    private now: () => number = Date.now.bind(Date),
  ) {
    this.remaining = { w: tc.initialMs, b: tc.initialMs };
  }

  start(first: 'w' | 'b'): void {
    this.activeSide = first;
    this.lastStamp = this.now();
    this.ensureTimer();
  }

  /** Called after a completed move by `side`; hands the clock over. */
  switchTo(next: 'w' | 'b'): void {
    const stamp = this.now();
    if (this.activeSide !== null) {
      const elapsed = stamp - this.lastStamp;
      this.remaining[this.activeSide] = Math.max(0, this.remaining[this.activeSide] - elapsed);
      this.remaining[this.activeSide] += this.tc.incrementMs;
    }
    this.activeSide = next;
    this.lastStamp = stamp;
    this.ensureTimer();
    this.handlers.onTick?.(this.state());
  }

  pause(): ClockState {
    this.tickOnce();
    const snap: ClockState = this.state();
    snap.running = false;
    this.pausedRemaining = snap;
    return snap;
  }

  resume(): void {
    if (!this.pausedRemaining) return;
    this.remaining = { w: this.pausedRemaining.remainingW, b: this.pausedRemaining.remainingB };
    this.pausedRemaining = null;
    this.lastStamp = this.now();
    this.ensureTimer();
  }

  stop(): ClockState {
    this.tickOnce();
    this.teardownTimer();
    const final = this.state();
    final.running = false;
    this.activeSide = null;
    return final;
  }

  state(): ClockState {
    return {
      running: this.timer !== null,
      activeSide: this.activeSide,
      remainingW: Math.round(this.remaining.w),
      remainingB: Math.round(this.remaining.b),
    };
  }

  dispose(): void {
    this.teardownTimer();
  }

  // -------------------------------------------------------------------------

  private tickOnce(): void {
    if (this.activeSide === null || this.flagged) return;
    const stamp = this.now();
    const delta = stamp - this.lastStamp;
    this.lastStamp = stamp;
    this.remaining[this.activeSide] = Math.max(0, this.remaining[this.activeSide] - delta);
    if (this.remaining[this.activeSide] <= 0) {
      this.flagged = true;
      this.teardownTimer();
      this.handlers.onFlag(this.activeSide);
    }
  }

  private ensureTimer(): void {
    if (this.timer || this.flagged || this.activeSide === null) return;
    this.timer = this.setIntervalFn(() => {
      this.tickOnce();
      if (!this.flagged) this.handlers.onTick?.(this.state());
    }, TICK_MS);
  }

  private teardownTimer(): void {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
  }
}
