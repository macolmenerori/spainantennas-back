import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildListResponse, getPagination } from './pagination';

describe('getPagination', () => {
  beforeEach(() => {
    vi.stubEnv('DEFAULT_PERPAGE', '20');
    vi.stubEnv('MAX_PERPAGE', '100');
  });

  it('defaults to page 1 and DEFAULT_PERPAGE', () => {
    expect(getPagination()).toEqual({ page: 1, perPage: 20, skip: 0 });
  });

  it('computes skip from page and perPage', () => {
    expect(getPagination(3, 10)).toEqual({ page: 3, perPage: 10, skip: 20 });
  });

  it('caps perPage at MAX_PERPAGE', () => {
    expect(getPagination(2, 500)).toEqual({ page: 2, perPage: 100, skip: 100 });
  });
});

describe('buildListResponse', () => {
  it('builds the list shape with totalPages rounded up', () => {
    expect(buildListResponse(['a', 'b'], 41, { page: 1, perPage: 20, skip: 0 })).toEqual({
      status: 'success',
      page: 1,
      perPage: 20,
      totalPages: 3,
      total: 41,
      results: ['a', 'b']
    });
  });

  it('reports 0 pages when nothing matches', () => {
    expect(buildListResponse([], 0, { page: 1, perPage: 20, skip: 0 })).toMatchObject({
      totalPages: 0,
      total: 0,
      results: []
    });
  });
});
