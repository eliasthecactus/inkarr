import type { EventBus, InkarrEvents } from '@inkarr/sdk';
import { createLogger } from './log.ts';

const log = createLogger('events');
type Handler = (payload: any) => void | Promise<void>;
const handlers = new Map<string, Set<Handler>>();

export const events: EventBus = {
  on(event, fn) {
    const set = handlers.get(event) ?? new Set();
    set.add(fn as Handler);
    handlers.set(event, set);
    return () => set.delete(fn as Handler);
  },
  emit<K extends keyof InkarrEvents>(event: K, payload: InkarrEvents[K]) {
    for (const fn of handlers.get(event) ?? []) {
      Promise.resolve()
        .then(() => fn(payload))
        .catch((err) => log.error(`handler for ${event} failed`, err));
    }
  },
};
