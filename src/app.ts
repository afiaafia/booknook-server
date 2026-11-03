import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { bookRoutes } from './modules/books/book.routes.js';
import { borrowRoutes } from './modules/borrows/borrow.routes.js';
import { uploadRoutes } from './modules/uploads/upload.routes.js';

export const app: Express = express();

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

// HTTP request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: true,
  })
);

// Request body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
});

app.use('/api', apiLimiter);

// Health endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'BookNook API is running',
    data: {
      status: 'healthy',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  });
});

// Root endpoint
app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to BookNook API',
  });
});

// Book routes
app.use('/api/books', bookRoutes);
app.use('/api/borrows', borrowRoutes);
app.use('/api/uploads', uploadRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'The requested resource was not found',
    error: {
      code: 'ROUTE_NOT_FOUND',
    },
  });
});

// Centralized error handler (must remain last)
app.use(errorHandler);
