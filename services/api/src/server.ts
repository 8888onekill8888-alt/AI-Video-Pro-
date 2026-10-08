import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createApp } from './app.js';

config();
config({ path: resolve(process.cwd(), '../../.env') });

const app = await createApp();
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info({ host, port }, 'Cineforge API ready');
} catch (error) {
  app.log.error({ err: error }, 'Could not start Cineforge API');
  process.exitCode = 1;
}

const shutdown = async () => {
  await app.close();
};
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });