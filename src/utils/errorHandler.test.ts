import { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import errorHandler from './errorHandler';

const makeRes = (headersSent = false) => {
  const res = { headersSent } as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const withType = (type: string) => Object.assign(new Error(type), { type });

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    ['malformed JSON', withType('entity.parse.failed'), 400, 'Invalid JSON body'],
    ['body too large', withType('entity.too.large'), 413, 'Request body too large']
  ])('responds %s with %i', (_name, err, status, message) => {
    const res = makeRes();
    errorHandler(err, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ status: 'fail', message });
  });

  it('responds 500 on any other error', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });

  it('delegates to next when headers were already sent', () => {
    const res = makeRes(true);
    const next = vi.fn() as unknown as NextFunction;
    const err = new Error('late');
    errorHandler(err, {} as Request, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
