import { Request } from 'express';

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Authenticated user, as returned by opensesame's `GET /users/isloggedin`.
 * Only the fields this API uses are kept.
 */
export type UserType = {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: string[];
};

/**
 * Express request with the user set by the `protect` middleware.
 */
export type RequestWithUser = Request & {
  user?: UserType;
};
