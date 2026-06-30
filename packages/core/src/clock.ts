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

export class Clock {
  private time = 0;
  private nextOrder = 0;
  private scheduled: ScheduledEvent[] = [];
  private active = new Set<ScheduledEvent>();
  private tickCallbacks: TickEvent[] = [];

  schedule(callback: ClockCallback, delay: number): void {
    this.scheduled.push({
      callback,
      due: this.time + validateDuration(delay, "delay"),
      interval: null,
      order: this.nextOrder,
      canceled: false,
    });
    this.nextOrder += 1;
  }

  schedule_unique(callback: ClockCallback, delay: number): void {
    this.unschedule(callback);
    this.schedule(callback, delay);
  }

  scheduleUnique(callback: ClockCallback, delay: number): void {
    this.schedule_unique(callback, delay);
  }

  schedule_interval(callback: ClockCallback, interval: number): void {
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

  scheduleInterval(callback: ClockCallback, interval: number): void {
    this.schedule_interval(callback, interval);
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

  each_tick(callback: TickCallback): void {
    this.tickCallbacks.push({ callback, canceled: false });
  }

  tick(dt: number): void {
    const delta = validateDuration(dt, "dt");
    const targetTime = this.time + delta;
    const tickCallbacks = [...this.tickCallbacks];
    for (const event of tickCallbacks) {
      if (!event.canceled) event.callback(delta);
    }
    this.tickCallbacks = this.tickCallbacks.filter((event) => !event.canceled);
    this.time = targetTime;

    let event = this.nextDueEvent();
    while (event && event.due <= this.time) {
      this.scheduled.splice(this.scheduled.indexOf(event), 1);
      if (!event.canceled) {
        this.active.add(event);
        event.callback();
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
}

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

export const clock = new Proxy({} as Clock, {
  get(_target, property) {
    const value = Reflect.get(getActiveClock(), property);
    return typeof value === "function" ? value.bind(getActiveClock()) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getActiveClock(), property, value);
  },
  has(_target, property) {
    return property in getActiveClock();
  },
}) as Clock;

function validateDuration(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return value;
}
