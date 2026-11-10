import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { initRealtime } from './realtime/io';
import { startSessionExpiry } from './jobs/sessions';

const server = createServer(createApp());
initRealtime(server);
startSessionExpiry();
server.listen(env.API_PORT, () => logger.info(`API em http://localhost:${env.API_PORT}`));
