import { app } from './app';
import { prisma } from './config/database';
import config from './config';

const port = config.port;

async function main() {
  try {
    // Verify DB connectivity on startup (fail fast). A boot that silently
    // proceeds despite a DB outage would come up "healthy" and then 500 on
    // every request — so we hard-exit instead.
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (e) {
    console.error('❌ Database connection failed. Is PostgreSQL running and DATABASE_URL set?', e);
    process.exit(1);
  }
  app.listen(port, () => {
    console.log(`🚀 API running at http://localhost:${port}/api`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});