import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/app-error.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  _next,
) => {
  const isOperational = error instanceof AppError;

  const statusCode = isOperational ? error.statusCode : 500;

  const message = isOperational
    ? error.message
    : "An unexpected error occurred";

  const code = isOperational ? error.code : "INTERNAL_SERVER_ERROR";

  if (statusCode >= 500) {
    logger.error(
      {
        err: error,
        method: req.method,
        path: req.originalUrl,
      },
      "Request failed",
    );
  } else {
    logger.warn(
      {
        code,
        method: req.method,
        path: req.originalUrl,
      },
      "Request rejected",
    );
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      ...(env.NODE_ENV === "development" && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
  });
};
