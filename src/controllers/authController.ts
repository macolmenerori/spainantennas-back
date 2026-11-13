/* eslint-disable no-console */
import { NextFunction, Response } from 'express';

import { RequestWithUser, UserType } from '../models/userTypes';
import catchAsync from '../utils/catchAsync';

const BEARER_REGEX = /^Bearer (\S+)$/;

const notLoggedIn = (res: Response) =>
  res.status(401).json({
    status: 'fail',
    message: 'You are not logged in! Please log in to get access.'
  });

const authUnavailable = (res: Response) =>
  res.status(503).json({
    status: 'error',
    message: 'Authentication service unavailable'
  });

/**
 * Middleware that allows only logged in users, no matter their role or permissions.
 * Forwards the Bearer token to opensesame (`GET ${AUTH_URL}/users/isloggedin`) and,
 * if valid, stores the user in `req.user`.
 *
 * Responds 401 when the token is missing, malformed or rejected by opensesame, and
 * 503 when opensesame times out, is unreachable or answers unexpectedly.
 *
 * @example
 * ```typescript
 * router.route('/placement').post(protect, createPlacementValidation, createPlacement);
 * ```
 */
export const protect = catchAsync(
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    // 1) Get the token, only from the Authorization header
    const token = req.headers.authorization?.match(BEARER_REGEX)?.[1];
    if (!token) {
      return notLoggedIn(res);
    }

    // 2) Verify the token against opensesame
    let authRes: globalThis.Response;
    try {
      authRes = await fetch(`${process.env.AUTH_URL}/users/isloggedin`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(Number(process.env.AUTH_TIMEOUT_MS))
      });
    } catch (err) {
      console.error('Auth service request failed:', err);
      return authUnavailable(res);
    }

    if (authRes.status === 401) {
      return notLoggedIn(res);
    }
    if (authRes.status !== 200) {
      console.error(`Auth service answered with unexpected status ${authRes.status}`);
      return authUnavailable(res);
    }

    let authUser: UserType | undefined;
    try {
      const authData = await authRes.json();
      authUser = authData?.data?.user;
    } catch (err) {
      console.error('Auth service sent an invalid body:', err);
      return authUnavailable(res);
    }
    if (!authUser) {
      console.error('Auth service response has no user');
      return authUnavailable(res);
    }

    // 3) Grant access, keeping only the fields this API uses
    req.user = {
      _id: authUser._id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
      permissions: authUser.permissions
    };

    next();
  }
);
