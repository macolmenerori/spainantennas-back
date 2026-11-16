import { beforeEach, describe, expect, it, vi } from 'vitest';

import checkEnvVars from './checkEnvVars';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '8083',
  DATABASE: 'mongodb://localhost/test',
  AUTH_URL: 'http://auth.test/api/v1',
  AUTH_TIMEOUT_MS: '10000',
  RATELIMIT_MAXCONNECTIONS: '100',
  RATELIMIT_WINDOWMS: '60000',
  CORS_WHITELIST: 'http://localhost:3000',
  DEFAULT_PERPAGE: '20',
  MAX_PERPAGE: '100'
};

describe('checkEnvVars', () => {
  beforeEach(() => {
    Object.entries(validEnv).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns false when every var is set and valid', () => {
    expect(checkEnvVars()).toBe(false);
  });

  it('returns true when a var is missing', () => {
    vi.stubEnv('AUTH_TIMEOUT_MS', '');
    expect(checkEnvVars()).toBe(true);
  });

  it.each(['abc', '0', '-5', '1.5', '10s'])('returns true when AUTH_TIMEOUT_MS is %s', (value) => {
    vi.stubEnv('AUTH_TIMEOUT_MS', value);
    expect(checkEnvVars()).toBe(true);
  });

  it.each([
    ['RATELIMIT_MAXCONNECTIONS', '0'],
    ['RATELIMIT_MAXCONNECTIONS', '100req'],
    ['RATELIMIT_WINDOWMS', '-1'],
    ['RATELIMIT_WINDOWMS', '1.5'],
    ['DEFAULT_PERPAGE', '0'],
    ['DEFAULT_PERPAGE', 'abc'],
    ['MAX_PERPAGE', '-1'],
    ['MAX_PERPAGE', '1.5']
  ])('returns true when %s is %s', (envVar, value) => {
    vi.stubEnv(envVar, value);
    expect(checkEnvVars()).toBe(true);
  });

  it('returns true when DEFAULT_PERPAGE is greater than MAX_PERPAGE', () => {
    vi.stubEnv('DEFAULT_PERPAGE', '101');
    expect(checkEnvVars()).toBe(true);
  });

  it('returns false when DEFAULT_PERPAGE equals MAX_PERPAGE', () => {
    vi.stubEnv('DEFAULT_PERPAGE', '100');
    expect(checkEnvVars()).toBe(false);
  });
});
