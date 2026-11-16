import pino, { type Logger, type LoggerOptions, type DestinationStream } from 'pino';
import pretty from 'pino-pretty';

/**
 * Structured logger (pino v10).
 *
 * - **TTY / dev**: colorized human-readable lines via `pino-pretty` (stderr)
 * - **CI / production / pipe**: pure JSON lines (stderr)
 *
 * Force mode:
 *   LOG_PRETTY=1  → always pretty
 *   LOG_PRETTY=0  → always JSON
 *   LOG_LEVEL     → fatal|error|warn|info|debug|trace (default: info)
 */

function wantPretty(): boolean {
  const flag = process.env['LOG_PRETTY'];
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return process.stderr.isTTY === true && process.env['NODE_ENV'] !== 'production';
}

function createDestination(): DestinationStream {
  if (wantPretty()) {
    return pretty({
      colorize: true,
      colorizeObjects: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{msg}',
      destination: 2,
      sync: true,
    }) as unknown as DestinationStream;
  }

  return pino.destination({
    dest: 2,
    sync: true,
    minLength: 0,
  });
}

const options: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
  base: {
    service: 'download-benchmark',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
};

export const logger: Logger = pino(options, createDestination());

/**
 * Child logger with bound fields (e.g. request index, url).
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export type { Logger };
