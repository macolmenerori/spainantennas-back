import { Express, NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./models/spainantennasModel', () => ({
  default: { create: vi.fn(), find: vi.fn(), countDocuments: vi.fn() }
}));

// Writes need a token: let every request through as a logged-in user
vi.mock('./controllers/authController', () => ({
  protect: (req: Request, res: Response, next: NextFunction) => next()
}));

const ORIGIN = 'http://localhost:3000';
const RATE_LIMIT = 3;

const placement = (i: number) => ({
  _id: `507f1f77bcf86cd7994390${String(i).padStart(2, '0')}`,
  status: 'active',
  siteOperator: 'Cellnex',
  location: { lat: 40.4168, lon: -3.7038, altM: 657 },
  postcode: '28001',
  transmitters: [],
  lastUpdate: '2026-11-16T10:00:00.000Z',
  source: 'Ministry station data'
});

let app: Express;
let model: {
  create: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
};
let lean: ReturnType<typeof vi.fn>;

/**
 * app.ts reads env when it loads, so each test stubs env, then imports fresh modules
 * (fresh rate limit store included).
 */
beforeEach(async () => {
  vi.stubEnv('CORS_WHITELIST', ORIGIN);
  vi.stubEnv('RATELIMIT_MAXCONNECTIONS', String(RATE_LIMIT));
  vi.stubEnv('RATELIMIT_WINDOWMS', '900000');
  vi.stubEnv('DEFAULT_PERPAGE', '20');
  vi.stubEnv('MAX_PERPAGE', '100');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.resetModules();

  app = (await import('./app')).default;
  model = (await import('./models/spainantennasModel')).default as unknown as typeof model;

  lean = vi.fn().mockResolvedValue([placement(1)]);
  const query = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), lean };
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  model.find.mockReturnValue(query);
  model.countDocuments.mockResolvedValue(1);
  model.create.mockImplementation(async (doc: object) => ({ _id: placement(1)._id, ...doc }));
});

describe('helmet', () => {
  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/healthcheck');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('rate limit', () => {
  it('answers 429 JSON with RateLimit headers once the limit is reached', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      const ok = await request(app).get('/api/v1/placement');
      expect(ok.status).toBe(200);
      expect(ok.headers.ratelimit).toBeDefined();
      expect(ok.headers['ratelimit-policy']).toBeDefined();
    }

    const res = await request(app).get('/api/v1/placement');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      status: 'fail',
      message: 'Too many requests, please try again later'
    });
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('counts unknown /api routes too, but never /healthcheck', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await request(app).get('/api/v1/nope')).status).toBe(404);
    }
    expect((await request(app).get('/api/v1/placement')).status).toBe(429);

    for (let i = 0; i < RATE_LIMIT + 2; i++) {
      expect((await request(app).get('/healthcheck')).status).toBe(200);
    }
  });

  it('keys clients by the X-Forwarded-For address set by the proxy (trust proxy 1)', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      await request(app).get('/api/v1/placement').set('X-Forwarded-For', '203.0.113.1');
    }

    const limited = await request(app)
      .get('/api/v1/placement')
      .set('X-Forwarded-For', '203.0.113.1');
    const other = await request(app).get('/api/v1/placement').set('X-Forwarded-For', '203.0.113.2');

    expect(limited.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it('carries CORS headers on a 429', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      await request(app).get('/api/v1/placement');
    }

    const res = await request(app).get('/api/v1/placement').set('Origin', ORIGIN);

    expect(res.status).toBe(429);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });
});

describe('cors', () => {
  it('exposes the rate limit headers to whitelisted origins', async () => {
    const res = await request(app).get('/api/v1/placement').set('Origin', ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-expose-headers']).toBe(
      'RateLimit,RateLimit-Policy,Retry-After'
    );
  });
});

describe('compression', () => {
  it('gzips large responses when the client accepts it', async () => {
    lean.mockResolvedValue(Array.from({ length: 20 }, (_, i) => placement(i)));

    const res = await request(app).get('/api/v1/placement').set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.body.results).toHaveLength(20);
  });

  it('leaves small responses uncompressed', async () => {
    const res = await request(app).get('/healthcheck').set('Accept-Encoding', 'gzip');

    expect(res.headers['content-encoding']).toBeUndefined();
  });
});

describe('mongo sanitize', () => {
  it('replaces $ in query values with _', async () => {
    await request(app).get('/api/v1/placement').query({ stationName: 'Ca$h' });

    const filter = model.find.mock.calls[0][0];
    expect(filter.transmitters.$elemMatch.stationName.test('Ca_h FM')).toBe(true);
    expect(filter.transmitters.$elemMatch.stationName.source).not.toContain('$');
  });

  it('replaces $ in body values with _ and keeps newlines', async () => {
    const res = await request(app).post('/api/v1/placement').send({
      status: 'active',
      siteOperator: 'Ca$h Towers',
      location: {},
      source: 'line one\nline two'
    });

    expect(res.status).toBe(201);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ siteOperator: 'Ca_h Towers', source: 'line one\nline two' })
    );
  });

  it('turns $ operator keys into unknown fields, rejected with 400', async () => {
    const res = await request(app).post('/api/v1/placement').send({
      status: 'active',
      siteOperator: 'Cellnex',
      location: {},
      source: 'manual',
      $where: '1'
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([expect.objectContaining({ msg: 'Unknown field(s): _where' })]);
    expect(model.create).not.toHaveBeenCalled();
  });
});

describe('fallbacks', () => {
  it('keeps the JSON 404 and malformed-body responses', async () => {
    const notFound = await request(app).get('/nope');
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ status: 'fail', message: "Can't find /nope on this server" });

    const malformed = await request(app)
      .post('/api/v1/placement')
      .set('Content-Type', 'application/json')
      .send('{"status":');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ status: 'fail', message: 'Invalid JSON body' });
  });

  it('allows only GET on /transmitter', async () => {
    const res = await request(app).post('/api/v1/transmitter').send({});
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET');
    expect(res.body).toEqual({ status: 'fail', message: 'Method not allowed' });
  });
});
