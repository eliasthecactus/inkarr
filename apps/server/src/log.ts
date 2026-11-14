import type { Logger } from '@inkarr/sdk';

export interface LogEntry { time: number; level: string; source: string; message: string; data?: unknown }

const buffer: LogEntry[] = [];
const MAX = 1000;

export function recentLogs(): LogEntry[] {
  return buffer.slice().reverse();
}

export function createLogger(source: string): Logger {
  const write = (level: string) => (message: string, data?: unknown) => {
    const entry: LogEntry = { time: Date.now(), level, source, message, data };
    buffer.push(entry);
    if (buffer.length > MAX) buffer.shift();
    if (level === 'debug' && !process.env.INKARR_DEBUG) return;
    const line = `${new Date(entry.time).toISOString()} ${level.toUpperCase().padEnd(5)} [${source}] ${message}`;
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    data === undefined ? out(line) : out(line, data instanceof Error ? data.message : data);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}
