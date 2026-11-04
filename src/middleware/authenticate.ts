import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../config/env.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;
type SessionVerifier = (cookie: string) => Promise<AuthenticatedUser | null>;

const jwks = createRemoteJWKSet(new URL('/api/auth/jwks', env.BETTER_AUTH_URL));

const verifyBearerToken: TokenVerifier = async (token) => {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.BETTER_AUTH_URL,
    audience: env.BETTER_AUTH_URL,
  });

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.name !== 'string' ||
    typeof payload.email !== 'string'
  ) {
    throw new Error('JWT is missing required user claims');
  }

  return { id: payload.sub, name: payload.name, email: payload.email };
};

const verifySessionCookie: SessionVerifier = async (cookie) => {
  const response = await fetch(`${env.CLIENT_URL}/api/auth/get-session`, {
    method: 'GET',
    headers: { cookie },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error('Authentication service unavailable');
  }

  const data = (await response.json()) as {
    user?: { id?: string; name?: string; email?: string } | null;
  } | null;

  if (!data?.user?.id || !data.user.name || !data.user.email) return null;

  return {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
  };
};

export function createAuthenticate(
  verifyToken: TokenVerifier,
  verifySession: SessionVerifier
): RequestHandler {
  return async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (authorization) {
      const match = /^Bearer ([^\s]+)$/i.exec(authorization);
      if (!match) {
        res.status(401).json({
          success: false,
          message: 'Invalid bearer authorization header',
          error: { code: 'UNAUTHORIZED' },
        });
        return;
      }
      const token = match[1];
      if (!token) {
        res.status(401).json({
          success: false,
          message: 'Invalid bearer authorization header',
          error: { code: 'UNAUTHORIZED' },
        });
        return;
      }

      try {
        res.locals.authUser = await verifyToken(token);
        next();
      } catch (error) {
        req.log?.error(
            {
              code: error instanceof Error ? (error as Error & { code?: string }).code : undefined,
              message: error instanceof Error ? error.message : String(error),
            },
            'Bearer token validation failed'
          );
        res.status(401).json({
          success: false,
          message: 'Invalid or expired access token',
          error: { code: 'UNAUTHORIZED' },
        });
      }
      return;
    }

    const cookie = req.headers.cookie;

    if (!cookie) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: { code: 'UNAUTHORIZED' },
      });
      return;
    }

    try {
      const user = await verifySession(cookie);
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid or expired session',
          error: { code: 'UNAUTHORIZED' },
        });
        return;
      }

      res.locals.authUser = user;
      next();
    } catch (error) {
      req.log?.error({ err: error }, 'Authentication service request failed');

      res.status(503).json({
        success: false,
        message: 'Could not verify authentication',
        error: { code: 'AUTH_SERVICE_UNAVAILABLE' },
      });
    }
  };
}

export const authenticate: RequestHandler = createAuthenticate(
  verifyBearerToken,
  verifySessionCookie
);
