export type Pagination = {
  page: number;
  perPage: number;
  skip: number;
};

/**
 * Resolves the validated `page` and `perPage` query values. `page` defaults to 1,
 * `perPage` to `DEFAULT_PERPAGE` and is capped at `MAX_PERPAGE` (both checked at startup
 * by `checkEnvVars`).
 */
export const getPagination = (page?: number, perPage?: number): Pagination => {
  const resolvedPage = page ?? 1;
  const resolvedPerPage = Math.min(
    perPage ?? Number(process.env.DEFAULT_PERPAGE),
    Number(process.env.MAX_PERPAGE)
  );
  return {
    page: resolvedPage,
    perPage: resolvedPerPage,
    skip: (resolvedPage - 1) * resolvedPerPage
  };
};

/**
 * Builds the list response shape shared by every paginated endpoint.
 */
export const buildListResponse = <T>(
  results: T[],
  total: number,
  { page, perPage }: Pagination
) => ({
  status: 'success' as const,
  page,
  perPage,
  totalPages: Math.ceil(total / perPage),
  total,
  results
});
