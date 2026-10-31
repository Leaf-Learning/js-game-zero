import { createActiveServiceProxy } from "./active-service";
import { guardSpellings } from "./friendly-names";
import { describeValue } from "./util";

type ClockCallback = () => void;
type TickCallback = (dt: number) => void;

type ScheduledEvent = {
  callback: ClockCallback;
  due: number;
  interval: number | null;
  order: number;
  canceled: boolean;
};

type TickEvent = {
  callback: TickCallback;
  canceled: boolean;
};

/**
 * A schedule takes the function to call later. The usual slip is calling it
 * now, `clock.scheduleInterval(spawn(), 1)`, which hands over what it
 * returned (usually `undefined`), so say so where it happens rather than when
 * the clock first fires.
 */
function requireCallback(
  callback: unknown,
  method: string,
  rest = ", 1",
): void {
  if (typeof callback === "function") return;
  throw new TypeError(
    `clock.${method} needs a function to call later, but got ${describeValue(callback)}. Give the function's name without brackets: clock.${method}(spawn${rest}), not clock.${method}(spawn()${rest}).`,
  );
}

export type ClockOptions = {
  /** Receives callback failures after the failing callback is unscheduled. */
  readonly onError?: (error: unknown) => void;
};

export class Clock {
  private time = 0;
  private nextOrder = 0;
  private scheduled: ScheduledEvent[] = [];
  private active = new Set<ScheduledEvent>();
  private tickCallbacks: TickEvent[] = [];

  constructor(private readonly options: ClockOptions = {}) {}

  schedule(callback: ClockCallback, delay: number): void {
    requireCallback(callback, "schedule");
    this.scheduled.push({
      callback,
      due: this.time + validateDuration(delay, "delay"),
      interval: null,
      order: this.nextOrder,
      canceled: false,
    });
    this.nextOrder += 1;
  }

  scheduleUnique(callback: ClockCallback, delay: number): void {
    requireCallback(callback, "scheduleUnique");
    this.unschedule(callback);
    this.schedule(callback, delay);
  }

  scheduleInterval(callback: ClockCallback, interval: number): void {
    requireCallback(callback, "scheduleInterval");
    const seconds = validateDuration(interval, "interval");
    if (seconds === 0) throw new RangeError("interval must be greater than 0.");
    this.scheduled.push({
      callback,
      due: this.time + seconds,
      interval: seconds,
      order: this.nextOrder,
      canceled: false,
    });
    this.nextOrder += 1;
  }

  unschedule(callback: Function): void {
    for (const event of this.scheduled) {
      if (event.callback === callback) event.canceled = true;
    }
    for (const event of this.active) {
      if (event.callback === callback) event.canceled = true;
    }
    for (const event of this.tickCallbacks) {
      if (event.callback === callback) event.canceled = true;
    }
    this.scheduled = this.scheduled.filter((event) => !event.canceled);
    this.tickCallbacks = this.tickCallbacks.filter((event) => !event.canceled);
  }

  eachTick(callback: TickCallback): void {
    requireCallback(callback, "eachTick", "");
    this.tickCallbacks.push({ callback, canceled: false });
  }

  clear(): void {
    for (const event of this.scheduled) event.canceled = true;
    for (const event of this.active) event.canceled = true;
    for (const event of this.tickCallbacks) event.canceled = true;
    this.scheduled = [];
    this.tickCallbacks = [];
  }

  tick(dt: number): void {
    const delta = validateDuration(dt, "dt");
    const targetTime = this.time + delta;
    const tickCallbacks = [...this.tickCallbacks];
    for (const event of tickCallbacks) {
      if (event.canceled) continue;
      try {
        event.callback(delta);
      } catch (error) {
        this.reportCallbackError(error);
        this.unschedule(event.callback);
      }
    }
    this.tickCallbacks = this.tickCallbacks.filter((event) => !event.canceled);
    this.time = targetTime;

    // Anything scheduled from here on waits for the next tick, so a callback
    // that schedules itself with a delay of 0 runs once a frame rather than
    // forever in this one.
    const firstLater = this.nextOrder;
    let event = this.nextDueEvent();
    while (event && event.due <= this.time && event.order < firstLater) {
      this.scheduled.splice(this.scheduled.indexOf(event), 1);
      if (!event.canceled) {
        this.active.add(event);
        try {
          event.callback();
        } catch (error) {
          this.reportCallbackError(error);
          this.active.delete(event);
          this.unschedule(event.callback);
          event = this.nextDueEvent();
          continue;
        }
        this.active.delete(event);
      }
      if (event.interval !== null && !event.canceled) {
        event.due += event.interval;
        this.scheduled.push(event);
      }
      event = this.nextDueEvent();
    }
  }

  now(): number {
    return this.time;
  }

  private nextDueEvent(): ScheduledEvent | undefined {
    this.scheduled = this.scheduled.filter((event) => !event.canceled);
    return this.scheduled.reduce<ScheduledEvent | undefined>((best, event) => {
      if (!best) return event;
      if (event.due < best.due) return event;
      if (event.due === best.due && event.order < best.order) return event;
      return best;
    }, undefined);
  }

  private reportCallbackError(error: unknown): void {
    if (this.options.onError) this.options.onError(error);
    else reportClockCallbackError(error);
  }
}

guardSpellings(Clock.prototype, "clock");

const defaultClock = new Clock();
let activeClock: Clock | null = null;

export function setActiveClock(nextClock: Clock | null): Clock | null {
  const previous = activeClock;
  activeClock = nextClock;
  return previous;
}

export function getActiveClock(): Clock {
  return activeClock ?? defaultClock;
}

export const clock = createActiveServiceProxy(getActiveClock);

function validateDuration(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return value;
}

function reportClockCallbackError(error: unknown): void {
  console.error("Error in scheduled clock callback:", error);
}
