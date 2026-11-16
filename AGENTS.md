# AGENTS.md

Guidance for coding agents working on `spainantennas-back`.

## Project

Express + TypeScript API over MongoDB (Mongoose) serving radio/TV antenna sites in Spain. A future React front (`spainantennas-front`) will show them on a map. Deployed on Heroku (eco dynos). Mirrors the structure and conventions of [rainlogger-back](https://github.com/macolmenerori/rainlogger-back) and [opensesame-back](https://github.com/macolmenerori/opensesame-back): check those repos when unsure how something is done.

## Stack

- Node >= 24, TypeScript 6 (strict, CommonJS, `src/` -> `dist/`), pnpm 12 (always use `pnpm`).
- Single `tsconfig.json`: `module: nodenext` (emits CJS because package.json has no `"type": "module"`), `target: es2025` (`RegExp.escape` available), `isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. No `verbatimModuleSyntax` (rejects `import` in CJS-mode files). No source maps. No path alias yet (tsc doesn't rewrite `@/` imports; use relative imports).
- Tests are co-located as `src/**/*.test.ts` and excluded from `tsconfig.json`, so `tsc` never emits them (and `pnpm types` doesn't check them; neither does it check `scripts/`).
- `pnpm-workspace.yaml` `allowBuilds` lists packages allowed (or explicitly denied) to run install scripts; esbuild (via tsx) is denied, its binary works without it.
- Express 5, Mongoose, express-validator, helmet, cors (origin whitelist), express-rate-limit on `/api`, `@exortek/express-mongo-sanitize`, compression, multer (import upload). Wired so far: cors, `express.json({ limit: '1mb' })`, express-validator; the rest is still to add (in its own change, not bundled with endpoints).
- `dotenv` loads `config.env` (gitignored); keep `config.env.example` (committed) updated. `checkEnvVars()` exits on missing vars, on a non-positive-integer `AUTH_TIMEOUT_MS`, `DEFAULT_PERPAGE` or `MAX_PERPAGE`, and when `DEFAULT_PERPAGE > MAX_PERPAGE`.
- ESLint (flat config, typescript-eslint, prettier, simple-import-sort) + Prettier.
- Vitest, unit tests only (mock Mongoose models and `fetch`; no real DB). `vitest.config.mts` (`.mts` because the package is CJS) restores mocks, stubbed globals and envs after each test. In tests that import Express's `Response` type, build fetch responses with `new globalThis.Response(...)`.
- swagger-jsdoc: `@openapi` JSDoc in `src/routes/*.ts`, generated to an OpenAPI file by `scripts/generateOpenapi.ts`.

## Commands (rainlogger style; missing ones still to create)

- `pnpm dev` (`nodemon --exec tsx src/server.ts`; tsx, not ts-node, also runs TS scripts), `pnpm build` (tsc), `pnpm start` (`node dist/server.js`)
- `pnpm lint` (`eslint --fix .`), `pnpm prettify` (`prettier -w .`, whole repo; `.prettierignore` excludes `data/`, `dist/`, lockfile, `description.md`), `pnpm types` (`tsc --noEmit`)
- ESLint (`eslint.config.mjs`) runs Prettier as a rule (`prettier/prettier`), so `pnpm lint` also fixes formatting. Non-type-aware `tseslint.configs.recommended`. Unused args ignored only if named `req|res|next|val` or `_`-prefixed. Import order enforced by simple-import-sort (`@macolmenerori` -> packages -> side-effect -> `../` -> `./`).
- `pnpm test` (vitest run), single test: `pnpm vitest run path/to/file.test.ts -t "name"`
- `pnpm verify`: audit -> lint -> prettify -> types -> test -> build
- `pnpm generate:openapi` (`tsx scripts/generateOpenapi.ts`)

## Structure

`src/server.ts` (dotenv, env check, Mongo connect, listen) · `src/app.ts` (middleware, `/healthcheck`, routers, 404, `errorHandler` last) · `src/routes/spainantennasRouter.ts` (one router for every resource, mounted at `/api/v1`, holds the `@openapi` components) · `src/controllers/` (`spainantennasController.ts`, `authController.ts` with `protect`) · `src/models/` (schema + types) · `src/validations/spainantennas.validations.ts` (all chains) · `src/utils/` (`catchAsync`, `methodNotAllowed`, `checkEnvVars`, `errorHandler`, pagination, filter builders).

## Data model

One `placements` collection. Transmitters are **embedded subdocuments with their own Mongoose `_id`**. Schema follows `data/README.md` (read `data/AGENTS.md` for data conventions):

- Model `src/models/spainantennasModel.ts` (default export `PlacementModel`), types and enum/bounds constants (`PLACEMENT_STATUSES`, `TRANSMITTER_TYPES`, `TRANSMITTER_TECHNOLOGIES`, `SPAIN_BOUNDS`) in `src/models/spainantennasTypes.ts`. Reuse those constants in validations; never repeat the values.
- Placement: `status` enum `active|inactive|unknown`; `siteOperator` string (`"unknown"` allowed); `location {lat, lon, altM}` (sub-schema, no `_id`); `postcode` nullable 5-digit string; `transmitters` default `[]` (empty allowed); `lastUpdate` Date (required, default now); `source` string.
- Location: `lat`/`lon` nullable **as a pair** (both set or both null; 1,109 TV sites have no coordinates yet, the front must skip them). When set, range-checked to the Spain box: lat 27-44, lon -19-5. `altM` nullable, unbounded (data has -1).
- Transmitter: `type` enum `TV|radio`; `technology` enum `AM-LW|AM-MW|FM|TDT|DAB+`; `frequencykHz` nullable number > 0 (kHz, FM too); `stationName`, `broadcaster`, `source` required non-empty strings; `powerKw` nullable number >= 0.
- Max lengths (schema `maxlength` and validators): `MAX_NAME_LENGTH` 200 for `siteOperator`, `stationName`, `broadcaster`; `MAX_SOURCE_LENGTH` 5000 for both `source` fields (longest in the data: 86 and 1754). Postcode pattern is `POSTCODE_REGEX`. All in `spainantennasTypes.ts`.
- Nullable fields (`lat`, `lon`, `altM`, `postcode`, `frequencykHz`, `powerKw`) are not required and default to `null`, so every document has every key. Strings are trimmed.
- Schema options on all three schemas: `versionKey: false` (no `__v`), `strict: 'throw'` (unknown keys fail). An unknown root key throws `StrictModeError` from the constructor; an unknown transmitter key surfaces as a cast `ValidationError`. Import must catch both per item.
- No Mongoose `timestamps`. Indexes: `status`, `postcode`, `{transmitters.technology, transmitters.type}`. Accent-insensitive text filters are built at query time (accent-class regex), not stored.
- The lat/lon pair validator runs on document validation (`save`, `validate`, `insertMany`), not on `findOneAndUpdate`. Updates must load, set, then `save()`. `validateSync()` is deprecated in Mongoose 9; use `validate()`.
- `stationName` is NOT unique within a placement (TV repeats channels across multiplexes). Always address a transmitter by its `_id`.
- `lastUpdate` is stamped by the server (now) on any placement or transmitter create/update/delete; client value ignored. Import keeps the file's `lastUpdate`.

## API

Base path `/api/v1`. Write endpoints use `protect` (any valid opensesame JWT; no role/permission check). Disallowed methods -> 405 via `methodNotAllowed`.

Auth (`src/controllers/authController.ts`): `protect` reads only `Authorization: Bearer <token>` (no cookie; the front logs in to opensesame with header `authorizationtype: bearer`). It calls `GET ${AUTH_URL}/users/isloggedin` with `AbortSignal.timeout(AUTH_TIMEOUT_MS)`, no caching. Missing/malformed token or upstream 401 -> 401. Timeout, network error, other status or bad body -> 503 `Authentication service unavailable`. On success `req.user` holds only `_id, name, email, role, permissions`; handlers type `req` as `RequestWithUser` (`src/models/userTypes.ts`).

| Method | Path                                       | Auth | Notes                                                                |
| ------ | ------------------------------------------ | ---- | -------------------------------------------------------------------- |
| GET    | `/healthcheck`                             | no   | outside `/api/v1`                                                    |
| GET    | `/placement`                               | no   | paginated; filters below; `fields=summary` omits transmitters        |
| POST   | `/placement`                               | yes  | full placement, transmitters optional                                |
| PUT    | `/placement/:id`                           | yes  | full replace of placement fields only; `transmitters` in body -> 400 |
| DELETE | `/placement/:id`                           | yes  |                                                                      |
| POST   | `/placement/import`                        | yes  | multipart field `file` (JSON array, data-file format)                |
| POST   | `/placement/:id/transmitter`               | yes  | add one transmitter                                                  |
| GET    | `/transmitter`                             | no   | paginated, `$unwind`                                                 |
| PUT    | `/transmitter/:placementId/:transmitterId` | yes  | full transmitter                                                     |
| DELETE | `/transmitter/:placementId/:transmitterId` | yes  | last one may be deleted                                              |
| GET    | `/export`                                  | yes  | not paginated                                                        |
| GET    | `/stats`                                   | no   | TBD, spec pending                                                    |

Filters:

- `/placement`: `id`, `status`, `siteOperator`, `postcode`, and transmitter filters `type`, `technology`, `stationName`, `broadcaster`. No location/geo filter. Transmitter filters combine in one `$elemMatch` (same transmitter must match); matching placements return **all** their transmitters.
- `/transmitter`: `id` (placement id), `broadcaster`, `stationName`, `type`, `technology`. Each item: transmitter fields + `_id`, `placementId`, `placement: {status, location, postcode}`.
- Text filters (`siteOperator`, `stationName`, `broadcaster`) are escaped-regex, case- and accent-insensitive partial matches (`accentInsensitiveRegex` in `src/utils/filters.ts`: vowels <-> acute/grave/circumflex/diaeresis/tilde forms, `n` <-> `ñ`, `c` <-> `ç`, both ways). Single term, trimmed, 1-`MAX_NAME_LENGTH` chars; commas are literal.
- Comma lists (`id`, `postcode`, enums): `$in`, items trimmed, no empty items, at most `MAX_FILTER_LIST_ITEMS` (100, `src/utils/consts.ts`), each item validated (ObjectId, `POSTCODE_REGEX`, enum constants). `postcode` matches exactly. A `+` must be sent as `%2B` (`technology=FM,DAB%2B`). Single placement = `GET /placement?id=...` (list shape; no match = 200 with empty `results`, never 404).
- Query strictness: unknown query parameters -> 400 (`Unknown query parameter(s): ...`). Each parameter may appear once (a repeated key -> 400) and cannot be empty. `fields` accepts only `summary` (projection `{ transmitters: 0 }`).
- Express 5 re-parses `req.query` on every access, so express-validator sanitizers don't stick: controllers read query values with `matchedData(req, { locations: ['query'] })`.

Pagination (all GETs except `/export`, helpers in `src/utils/pagination.ts`): `page` default 1, `perPage` default `DEFAULT_PERPAGE`; both positive integers (else 400). `perPage` over `MAX_PERPAGE` is silently capped and the response echoes the capped value. A page past the end returns 200 with empty `results`; `totalPages` is 0 when nothing matches. Stable default sort by `_id`. Lists use `find(...).lean()` and `countDocuments` in parallel.

Responses:

- List: `{ status: "success", page, perPage, totalPages, total, results: [...] }`
- Single: `{ status: "success", data: { placement | transmitter } }`
- Error: `{ status: "fail" | "error", message, errors? }` (400 validation or malformed JSON, 401 auth, 404, 405, 413 body over 1 MB, 500, 503 auth service unavailable). 4xx use `fail`, 5xx use `error` (`catchAsync` and `errorHandler` included).
- Validation 400: `{ status: "fail", message: "Invalid input data", errors }`, `errors` from `validationResult().array()`. A Mongoose `ValidationError` on save is mapped to the same shape (`type`, `msg`, `path`, `location`).
- Create: 201 with the single shape.

Import: run the API locally against the target DB for the big `data/*.json` files (Heroku has a 30 s request limit and 512 MB RAM). Size limit `IMPORT_MAX_SIZE_MB`; global `express.json` limit stays small. Validate each item with the Mongoose schema, `insertMany` in batches with `ordered: false`, ignore incoming `_id`s, respond `{ inserted, failed, errors: [{ index, message }] }`. No duplicate detection.

Export: stream a JSON array from a Mongoose cursor as an attachment, same shape as the data files plus `_id` on placements and transmitters (re-importable).

## Validation

express-validator chains in `src/validations/` for path params (`isMongoId`), query params, pagination and bodies; controller short-circuits with 400. Mongoose schema is the final guard and validates import items. Controllers build documents explicitly; never forward raw `req.body`.

Body rules:

- Strict JSON types, no coercion: numbers must be JSON numbers (`"40.4"` -> 400), strings must be strings, `location` a plain object, `transmitters` an array.
- Unknown keys are rejected at every level (root, `location`, each transmitter) by the custom `onlyKeys` check. Not `checkExact()`: it treats a validated parent (`location`, `transmitters.*`) as covering all its children, so nested unknown keys would pass.
- `_id` is never accepted in a body (root or transmitter): ids live in the path. `lastUpdate` is accepted and ignored.
- Nullable fields may be omitted or `null` (`optional({ values: 'null' })`); the controller stores `null`. `transmitters` may be omitted (stored `[]`) but not `null`. `location` is required; `{}` is valid (no coordinates).
- Required strings are trimmed, non-empty and length-capped. The validators also enforce the lat/lon pair rule and `SPAIN_BOUNDS`, so clients get field paths instead of a Mongoose error.

## Environment variables

`NODE_ENV`, `PORT`, `DATABASE`, `AUTH_URL`, `AUTH_TIMEOUT_MS`, `CORS_WHITELIST`, `RATELIMIT_MAXCONNECTIONS`, `RATELIMIT_WINDOWMS`, `DEFAULT_PERPAGE`, `MAX_PERPAGE`, `IMPORT_MAX_SIZE_MB`.

## Notes

- `data/` is gitignored source data; never commit it or edit it from this repo.
- `description.md` is the original project brief, kept for reference and gitignored. This file is the source of truth when they differ.
- Git not initialized yet.
