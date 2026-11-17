import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';

/**
 * Sends the 400 response when express-validator found errors.
 *
 * @returns The sent response when validation failed, `undefined` otherwise
 */
export const checkValidation = (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid input data',
      errors: errors.array()
    });
  }
};

/**
 * Middleware form of `checkValidation`: responds 400 when the chains before it found
 * errors, otherwise passes on. Use it to stop a request before costly middleware (such as
 * an upload) runs.
 *
 * @example
 * ```typescript
 * router.post('/x', protect, xValidation, rejectInvalidRequest, upload, handler);
 * ```
 */
export const rejectInvalidRequest = (req: Request, res: Response, next: NextFunction): void => {
  if (checkValidation(req, res) === undefined) {
    next();
  }
};
