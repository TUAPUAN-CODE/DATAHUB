import winston from 'winston';
import { env } from '../config/env';

export const logger = winston.createLogger({
  level: env.isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    env.isProd
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} ${level.toUpperCase()} ${message}${extra}`;
        }),
  ),
  transports: [new winston.transports.Console()],
});
