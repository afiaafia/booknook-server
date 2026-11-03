import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { describe, it } from 'node:test';

import {
  createAuthenticate,
  type AuthenticatedUser,
} from '../../src/middleware/authenticate.js';

const user: AuthenticatedUser = {
  id: 'auth-user-id',
  name: 'Reader',
  email: 'reader@example.test',
};

async function runMiddleware(
  headers: Record<string, string>,
  verifyToken: (token: string) => Promise<AuthenticatedUser>,
  verifySession: (cookie: string) => Promise<AuthenticatedUser | null>
) {
  let statusCode = 200;
  let responseBody: unknown;
  let nextCalled = false;
  const req = {
    headers,
    log: { warn() {}, error() {} },
  } as unknown as Request;
  const res = {
    locals: {} as Record<string, unknown>,
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      responseBody = body;
      return this;
    },
  } as unknown as Response;

  await createAuthenticate(verifyToken, verifySession)(req, res, () => {
    nextCalled = true;
  });

  return {
    statusCode,
    responseBody,
    nextCalled,
    authUser: res.locals.authUser,
  };
}

describe('authenticate middleware', () => {
  it('accepts a verified bearer token and ignores frontend identity headers', async () => {
    const result = await runMiddleware(
      {
        authorization: 'Bearer signed-token',
        'x-user-id': 'attacker-chosen-id',
        cookie: 'session=unused',
      },
      async (token) => {
        assert.equal(token, 'signed-token');
        return user;
      },
      async () => {
        throw new Error('Session fallback must not run for bearer auth');
      }
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, true);
    assert.deepEqual(result.authUser, user);
  });

  it('rejects invalid bearer tokens without falling back to a cookie', async () => {
    let sessionCalled = false;
    const result = await runMiddleware(
      { authorization: 'Bearer forged', cookie: 'session=valid' },
      async () => {
        throw new Error('bad signature');
      },
      async () => {
        sessionCalled = true;
        return user;
      }
    );

    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalled, false);
    assert.equal(sessionCalled, false);
  });

  it('retains the Better Auth session-cookie fallback', async () => {
    const result = await runMiddleware(
      { cookie: 'session=valid' },
      async () => user,
      async (cookie) => {
        assert.equal(cookie, 'session=valid');
        return user;
      }
    );

    assert.equal(result.statusCode, 200);
    assert.equal(result.nextCalled, true);
    assert.deepEqual(result.authUser, user);
  });
});
