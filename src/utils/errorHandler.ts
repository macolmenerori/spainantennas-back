/* eslint-disable no-console */
import { NextFunction, Request, Response } from 'express';

// body-parser errors carry a `type` (e.g. 'entity.parse.failed', 'entity.too.large')
type HttpError = Error & { type?: string };

/**
 * Final error middleware. Keeps every error response JSON:
 * malformed JSON body -> 400, body over the express.json limit -> 413, anything else -> 500.
 *
 * @example
 * ```typescript
 * app.use(errorHandler); // after every router and the 404 handler
 * ```
 */
const errorHandler = (err: HttpError, req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ status: 'fail', message: 'Invalid JSON body' });
    return;
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({ status: 'fail', message: 'Request body too large' });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
};

export default errorHandler;
