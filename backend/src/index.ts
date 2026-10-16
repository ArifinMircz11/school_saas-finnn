import { app } from './app';
import { prisma } from './config/database';
import config from './config';

const port = config.port;

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (e) {
    if (config.nodeEnv === 'production') {
      // Do not serve production requests while the authoritative database is unavailable.
      throw e;
    }
    console.warn('⚠️ Database connection warning: running without active database connection.', e);
  }
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 API running at http://0.0.0.0:${port}/api`);
  });
}

main().catch((e) => {
  console.error('❌ Backend startup failed.', e);
  process.exit(1);
});