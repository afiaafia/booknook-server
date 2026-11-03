import { createServer } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import {
  connectDatabase,
  closeDatabase,
} from "./config/database.js";
import { createDatabaseIndexes } from "./config/database-indexes.js";

const server = createServer(app);

let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;

  isShuttingDown = true;

  logger.info({ signal }, "Server shutdown initiated");

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);

  forceExit.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await closeDatabase();

    logger.info("Application shutdown completed");
  } catch (error) {
    logger.error({ err: error }, "Shutdown failed");
    process.exitCode = 1;
  } finally {
    clearTimeout(forceExit);
  }
};

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    await createDatabaseIndexes();

    server.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          environment: env.NODE_ENV,
        },
        "BookNook API server started",
      );
    });
  } catch (error) {
    logger.fatal({ err: error }, "Application startup failed");

    await closeDatabase().catch(() => undefined);

    process.exitCode = 1;
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void startServer();
