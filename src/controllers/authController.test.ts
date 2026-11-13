import { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestWithUser } from '../models/userTypes';

import { protect } from './authController';

const AUTH_URL = 'http://auth.test/api/v1';

const user = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  permissions: ['read']
};

/**
 * Runs protect and resolves once it responds or calls next.
 * catchAsync does not return the handler's promise, so we wait on the side effects.
 */
const runProtect = (authorization?: string) =>
  new Promise<{ req: RequestWithUser; res: Response; next: NextFunction }>((resolve) => {
    const req = { headers: authorization ? { authorization } : {} } as RequestWithUser;
    const res = {} as Response;
    const done = () => resolve({ req, res, next });
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(() => {
      done();
      return res;
    });
    const next = vi.fn().mockImplementation(done) as unknown as NextFunction;
    protect(req, res, next);
  });

const jsonResponse = (status: number, body: unknown) =>
  new globalThis.Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('protect', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('AUTH_URL', AUTH_URL);
    vi.stubEnv('AUTH_TIMEOUT_MS', '10000');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['empty token', 'Bearer '],
    ['scheme only', 'Bearer'],
    ['no space', 'Bearerabc'],
    ['extra part', 'Bearer abc def']
  ])('responds 401 without calling auth service (%s)', async (_name, authorization) => {
    const { res, next } = await runProtect(authorization);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'fail' }));
  });

  it('sets req.user with only the known fields and calls next on 200', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: 'success',
        message: 'User is logged in',
        data: {
          user: {
            ...user,
            __v: 0,
            passwordChangedAt: '2026-01-01T00:00:00.000Z',
            passwordResetToken: 'secret'
          }
        }
      })
    );

    const { req, res, next } = await runProtect('Bearer valid.token');

    expect(fetchMock).toHaveBeenCalledWith(`${AUTH_URL}/users/isloggedin`, {
      headers: { Authorization: 'Bearer valid.token' },
      signal: expect.any(AbortSignal)
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toStrictEqual(user);
  });

  it('responds 401 when auth service rejects the token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { status: 'fail', message: 'Invalid token provided.' })
    );

    const { res, next } = await runProtect('Bearer bad.token');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'You are not logged in! Please log in to get access.'
    });
  });

  it.each([403, 404, 500, 502])('responds 503 on unexpected status %i', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { status: 'error' }));

    const { res, next } = await runProtect('Bearer some.token');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Authentication service unavailable'
    });
  });

  it.each([
    ['timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError')],
    ['network error', new TypeError('fetch failed')]
  ])('responds 503 when fetch fails (%s)', async (_name, error) => {
    fetchMock.mockRejectedValue(error);

    const { res, next } = await runProtect('Bearer some.token');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('responds 503 when the 200 body is not JSON', async () => {
    fetchMock.mockResolvedValue(new globalThis.Response('not json', { status: 200 }));

    const { res, next } = await runProtect('Bearer some.token');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('responds 503 when the 200 body has no user', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'success', data: {} }));

    const { res, next } = await runProtect('Bearer some.token');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
