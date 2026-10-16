import { app } from './app';
import config from './config';

const port = config.port;

async function main() {
  const { testFirestoreConnection } = await import('./config/firestore');
  const readiness = await testFirestoreConnection();
  if (readiness.success) {
    console.log('✅ Firestore connected to configured database');
  } else {
    console.warn('⚠️ Firestore readiness probe failed; API will start but readiness will return 503.');
  }
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 API running at http://0.0.0.0:${port}/api`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});