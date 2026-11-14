import { events } from './events.ts';
import { enabledInstances } from './providers.ts';
import { createLogger } from './log.ts';

const log = createLogger('connections');

/** Fan core events out to every enabled connection that opted in. */
export function wireConnections() {
  events.on('book.grabbed', async (e) => {
    for (const { row, instance } of enabledInstances('connection')) {
      if (row.settings._onGrab !== true || !instance.onGrab) continue;
      await instance.onGrab(e).catch((err) => log.warn(`${row.name} onGrab failed`, err));
    }
  });
  events.on('book.imported', async (e) => {
    for (const { row, instance } of enabledInstances('connection')) {
      if (row.settings._onImport === false || !instance.onImport) continue;
      try {
        await instance.onImport(e);
        log.info(`notified ${row.name}`);
      } catch (err) {
        log.warn(`${row.name} onImport failed`, err);
      }
    }
  });
}
