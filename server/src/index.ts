import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = await buildApp(config);

await app.listen({ port: config.port, host: config.host });
app.log.info(
  {
    db: config.dbPath,
    cabinet: config.staticDir ? '/cabinet/' : 'не собран (npm run build -w @ryadom/venue-dashboard)',
    trustProxy: config.trustProxy,
  },
  'Рядом: сервер запущен',
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().then(() => process.exit(0));
  });
}
