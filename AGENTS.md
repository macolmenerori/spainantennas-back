# AGENTS.md

Guidance for coding agents working on `spainantennas-back`.

## Project

Express + TypeScript API over MongoDB (Mongoose) serving radio/TV antenna sites in Spain. A future React front (`spainantennas-front`) will show them on a map. Deployed on Heroku (eco dynos). Mirrors the structure and conventions of [rainlogger-back](https://github.com/macolmenerori/rainlogger-back) and [opensesame-back](https://github.com/macolmenerori/opensesame-back): check those repos when unsure how something is done.

## Stack

- Node >= 24, TypeScript 6 (strict, CommonJS, `src/` -> `dist/`), pnpm 12 (always use `pnpm`).
- Single `tsconfig.json`: `module: nodenext` (emits CJS because package.json has no `"type": "module"`), `target: es2025` (`RegExp.escape` available), `isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. No `verbatimModuleSyntax` (rejects `import` in CJS-mode files). No source maps. No path alias yet (tsc doesn't rewrite `@/` imports; use relative imports).
- Tests are co-located as `src/**/*.test.ts` and excluded from `tsconfig.json`, so `tsc` never emits them (and `pnpm types` doesn't check them; neither does it check `scripts/`).
- `pnpm-workspace.yaml` `allowBuilds` lists packages allowed (or explicitly denied) to run install scripts; esbuild (via tsx) is denied, its binary works without it.
- Express 5, Mongoose, express-validator, helmet, cors (origin whitelist), express-rate-limit on `/api`, `@exortek/express-mongo-sanitize`, compression, multer (import upload, route-level only: `src/utils/uploadImportFile.ts`, never global). Middleware order in `app.ts`, keep it:
  1. `app.set('trust proxy', 1)`: Heroku's router is the one proxy, so `req.ip` is the real client (rate-limit key). Hard-coded, Heroku is the only target.
  2. cors (+ `app.options`): first, so preflights end before the limiter and 429s carry CORS headers. `exposedHeaders: RateLimit, RateLimit-Policy, Retry-After`.
  3. `helmet()` with defaults (CSP on).
  4. `rateLimit` on `/api` only (`/healthcheck` exempt), memory store (single dyno), `limit`/`windowMs` from `RATELIMIT_*`, `standardHeaders: 'draft-8'`, `legacyHeaders: false`, custom handler -> 429 JSON `{ status: "fail", message: "Too many requests, please try again later" }`.
  5. `express.json({ limit: '1mb' })`. No `express.urlencoded` (JSON-only API).
  6. `mongoSanitize({ patterns: [/\$/g], replaceWith: '_' })`: defense in depth after the body parser. Silently replaces `$` with `_` in body and query keys and values (`$where` key -> `_where`, then rejected by `onlyKeys`). Control chars (newlines) are kept. Params are not sanitized (every `:id` is `isMongoId`-validated).
  7. `compression()` defaults.
- `dotenv` loads `config.env` (gitignored) at the very top of `server.ts`, before importing `app` (which reads env when it loads); keep `config.env.example` (committed) updated. `checkEnvVars()` exits on missing vars, on a non-positive-integer `AUTH_TIMEOUT_MS`, `RATELIMIT_MAXCONNECTIONS`, `RATELIMIT_WINDOWMS`, `DEFAULT_PERPAGE`, `MAX_PERPAGE` or `IMPORT_MAX_SIZE_MB`, and when `DEFAULT_PERPAGE > MAX_PERPAGE`.
- ESLint (flat config, typescript-eslint, prettier, simple-import-sort) + Prettier.
- Vitest, no real DB (mock Mongoose models and `fetch`). Unit tests call handlers with fake req/res; `src/app.test.ts` drives the real `app` in-process with supertest (middleware, wiring), stubbing env then `vi.resetModules()` + dynamic `import('./app')` because `app.ts` reads env when it loads. `vitest.config.mts` (`.mts` because the package is CJS) restores mocks, stubbed globals and envs after each test. In tests that import Express's `Response` type, build fetch responses with `new globalThis.Response(...)`. `src/app.test.ts` mocks `protect` to let requests through; set `auth.deny = true` to make it answer 401. Export controller tests use a `Writable` fake response (`FakeExportResponse`) and a fake cursor (`next`/`close`); `app.test.ts` gives `lean()` a `cursor()` too. Import tests live in `spainantennasController.import.test.ts`: they use the real model (construction and `validate()` need no connection) and spy only on `insertMany`. The schema default `Date.now` is captured at load, so fake timers don't reach it.
- swagger-jsdoc: `@openapi` JSDoc in `src/routes/*.ts`, generated to an OpenAPI file by `scripts/generateOpenapi.ts`.

## Commands (rainlogger style)

- `pnpm dev` (`nodemon --exec tsx src/server.ts`; tsx, not ts-node, also runs TS scripts), `pnpm build` (tsc), `pnpm start` (`node dist/server.js`)
- `pnpm lint` (`eslint --fix .`), `pnpm prettify` (`prettier -w .`, whole repo; `.prettierignore` excludes `data/`, `dist/`, lockfile, `description.md`), `pnpm types` (`tsc --noEmit`)
- ESLint (`eslint.config.mjs`) runs Prettier as a rule (`prettier/prettier`), so `pnpm lint` also fixes formatting. Non-type-aware `tseslint.configs.recommended`. Unused args ignored only if named `req|res|next|val` or `_`-prefixed. Import order enforced by simple-import-sort (`@macolmenerori` -> packages -> side-effect -> `../` -> `./`).
- `pnpm test` (vitest run), single test: `pnpm vitest run path/to/file.test.ts -t "name"`
- `pnpm verify`: audit -> lint -> prettify -> types -> test -> build
- `pnpm generate:openapi` (`tsx scripts/generateOpenapi.ts`)
- `pnpm release <patch|minor|major>` (`tsx scripts/release.ts`): verify -> bump package.json (`pnpm version --no-git-tag-version`, no commit or tag) -> regenerate `openapi.yaml` (its `info.version` comes from package.json). Needs a clean working tree: pnpm's guard runs after verify, so it also stops the release if lint/prettify changed a file. Then commit, open the PR, and create the GitHub Release (tag `X.Y.Z`, no `v` prefix) from master.

## Structure

`src/server.ts` (dotenv, env check, Mongo connect, listen) · `src/app.ts` (middleware, `/healthcheck`, routers, 404, `errorHandler` last) · `src/routes/spainantennasRouter.ts` (one router for every resource, mounted at `/api/v1`, holds the `@openapi` components) · `src/controllers/` (`spainantennasController.ts`, `authController.ts` with `protect`) · `src/models/` (schema + types) · `src/validations/spainantennas.validations.ts` (all chains) · `src/utils/` (`catchAsync`, `checkValidation` (+ `rejectInvalidRequest` middleware), `methodNotAllowed`, `checkEnvVars`, `errorHandler`, `uploadImportFile`, pagination, filter builders).

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
- The lat/lon pair validator runs on document validation (`save`, `validate`, `insertMany`), not on `findOneAndUpdate`. Updates must load, set, then `save()`, except PUT transmitter (atomic positional update, see below). `validateSync()` is deprecated in Mongoose 9; use `validate()`.
- `versionKey: false` means no array versioning: saving a changed transmitter subdocument writes `$set` on `transmitters.<index>.*`, so a concurrent removal shifting the array would hit the wrong transmitter. Removing one with subdoc `deleteOne()` + `save()` is safe (`$pull` by `_id`).
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
| POST   | `/placement/import`                        | yes  | multipart field `file` (JSON array, data-file format); `?dryRun`     |
| POST   | `/placement/:id/transmitter`               | yes  | add one transmitter                                                  |
| GET    | `/transmitter`                             | no   | paginated, `$unwind`                                                 |
| PUT    | `/transmitter/:placementId/:transmitterId` | yes  | full transmitter                                                     |
| DELETE | `/transmitter/:placementId/:transmitterId` | yes  | last one may be deleted                                              |
| GET    | `/export`                                  | yes  | not paginated, streamed attachment; filters below; `?compact`        |
| GET    | `/stats`                                   | no   | placement count; filters `status`, `type`, `technology`              |

Filters:

- `/placement`: `id`, `status`, `siteOperator`, `postcode`, and transmitter filters `type`, `technology`, `stationName`, `broadcaster`. No location/geo filter. Transmitter filters combine in one `$elemMatch` (same transmitter must match); matching placements return **all** their transmitters.
- `/transmitter`: `placementId` (placement id list; not `id`, which would read as the transmitter's), placement filters `status`, `siteOperator`, `postcode`, and transmitter filters `type`, `technology`, `stationName`, `broadcaster`. No `fields`. Each item: transmitter fields + `_id` (transmitter's), `placementId`, `placement: {status, siteOperator, location, postcode}`. Aggregation: `$match` placements (placement filters + transmitter `$elemMatch`; ids cast to ObjectId, aggregation doesn't cast) -> `$sort {_id: 1}` -> `$unwind` -> `$match` on `transmitters.*` (only with transmitter filters) -> `$skip`/`$limit` -> `$project`. Sorting before `$unwind` uses the index (no in-memory sort of ~104k transmitters); order is placement `_id`, then array order. Total from a parallel aggregate ending in `$count`. Placements without transmitters yield nothing; sites without coordinates are included.
- Text filters (`siteOperator`, `stationName`, `broadcaster`) are escaped-regex, case- and accent-insensitive partial matches (`accentInsensitiveRegex` in `src/utils/filters.ts`: vowels <-> acute/grave/circumflex/diaeresis/tilde forms, `n` <-> `ñ`, `c` <-> `ç`, both ways). Single term, trimmed, 1-`MAX_NAME_LENGTH` chars; commas are literal.
- Comma lists (`id`, `postcode`, enums): `$in`, items trimmed, no empty items, at most `MAX_FILTER_LIST_ITEMS` (100, `src/utils/consts.ts`), each item validated (ObjectId, `POSTCODE_REGEX`, enum constants). `postcode` matches exactly. A `+` must be sent as `%2B` (`technology=FM,DAB%2B`). Single placement = `GET /placement?id=...` (list shape; no match = 200 with empty `results`, never 404).
- Query strictness: unknown query parameters -> 400 (`Unknown query parameter(s): ...`). Each parameter may appear once (a repeated key -> 400) and cannot be empty. `fields` accepts only `summary` (projection `{ transmitters: 0 }`).
- Express 5 re-parses `req.query` on every access, so express-validator sanitizers don't stick: controllers read query values with `matchedData(req, { locations: ['query'] })`.

Pagination (all GETs except `/export`, helpers in `src/utils/pagination.ts`): `page` default 1, `perPage` default `DEFAULT_PERPAGE`; both positive integers (else 400). `perPage` over `MAX_PERPAGE` is silently capped and the response echoes the capped value. A page past the end returns 200 with empty `results`; `totalPages` is 0 when nothing matches. Stable default sort by `_id`. `/placement` uses `find(...).lean()` and `countDocuments` in parallel; `/transmitter` uses two aggregates in parallel (see Filters).

Responses:

- List: `{ status: "success", page, perPage, totalPages, total, results: [...] }`
- Single: `{ status: "success", data: { placement | transmitter } }`
- Error: `{ status: "fail" | "error", message, errors? }` (400 validation or malformed JSON, 401 auth, 404, 405, 413 body over 1 MB, 429 rate limit, 500, 503 auth service unavailable). 4xx use `fail`, 5xx use `error` (`catchAsync` and `errorHandler` included).
- Validation 400: `{ status: "fail", message: "Invalid input data", errors }`, `errors` from `validationResult().array()`. A Mongoose `ValidationError` on save is mapped to the same shape (`type`, `msg`, `path`, `location`).
- Create: 201 with the single shape.

Import (`POST /placement/import`): run the API locally against the target DB for the big `data/*.json` files (Heroku has a 30 s request limit and 512 MB RAM; TV.json is 61 MB and needs about 550 MB RSS). The global `express.json` limit stays small.

- Middleware order: `protect` -> `importPlacementsValidation` -> `rejectInvalidRequest` -> `uploadImportFile` -> `importPlacements`. Auth and query errors are answered before any file is buffered. The route is registered before `/placement/:id`.
- Query: only `dryRun` (`true`|`false`, given once); anything else -> 400 in the express-validator shape.
- Upload (multer `memoryStorage`, built per request from `IMPORT_MAX_SIZE_MB`): exactly one file in field `file`, mimetype `application/json` (curl: `-F "file=@TV.json;type=application/json"`), no text fields (`files: 1`, `fields: 0`).
  - Wrong mimetype -> 415 `File must be application/json`.
  - Over the limit -> 413 `File too large`.
  - Extra field or file, wrong field name, malformed multipart -> 400.
  - No file or a non-multipart body -> 400 `No file uploaded`.
- File: strict UTF-8 (BOM dropped) + `JSON.parse`, else 400 `Invalid JSON file`. Not an array -> 400 `File must contain a JSON array`. `[]` -> 200 with zero counts.
- Items: Mongoose schema only, casting allowed (`"40.4"` -> 40.4, unlike POST /placement). Before validating, each item is prepared:
  - A non-object item fails with `Item must be an object`.
  - `_id` is dropped at the root and on transmitters (new ids; an export re-imports as new documents).
  - A null `lastUpdate` is dropped, so the schema default stamps now, as for a missing one. A present one is kept.
  - Then `new PlacementModel(item)` + `validate()`. Catch `StrictModeError` (unknown root key) and `ValidationError`; anything else is rethrown.
- Error message per item: every failing path, `path: msg; path: msg`. Cast errors are rewritten (Mongoose prints whole values and reports a bad transmitter only as `transmitters`; the index is recovered from the failing value):
  - unknown key -> `Unknown field: transmitters.1.foo`
  - wrong type -> `transmitters.1: must be an object`, `transmitters: must be an array`
  - bad value -> `lastUpdate: Cast to date failed`
    No cap; `errors` sorted by `index`.
- Insert: validate all items first, then `insertMany(docs, { ordered: false, lean: true })` in batches of `IMPORT_BATCH_SIZE` (500, `src/utils/consts.ts`). `lean` skips re-validation. `MongoBulkWriteError.writeErrors[].index` is the index inside the batch; it is mapped back to the file index (`errmsg` as message), and `insertedCount` is added. Any other DB error -> 500 via `catchAsync`, after logging how many were inserted; earlier batches stay (no rollback). No duplicate detection.
- Responses (flat keys):
  - 201 `{ status: "success", inserted, failed, errors: [{ index, message }] }` when anything was inserted.
  - 400 `{ status: "fail", message: "No placements imported", inserted: 0, failed, errors }` when nothing was.
  - Dry run: 200 `{ status: "success", dryRun: true, valid, failed, errors }`, or 400 with `message: "No valid placements"` when no item is valid. Nothing is written.
  - The real-import body has no `dryRun` key.

Export (`GET /export`, `exportPlacements`):

- Middleware: `protect` -> `exportPlacementsValidation` -> `exportPlacements`.
- Query: only `status`, `postcode`, `type`, `technology` (same list rules as `/placement`, built with `buildPlacementFilter`) and `compact` (`true`|`false`, given once). Anything else -> 400 (no pagination, `fields`, `id` or text filters). No filter = every placement.
- Transmitter filters combine in one `$elemMatch`, and matching placements are exported with **all** their transmitters (not trimmed).
- Body: a JSON array of lean placements sorted by `_id`. Same shape as the data files plus `_id` on placements and transmitters (re-importable; import drops the ids). Pretty output is exactly `JSON.stringify(docs, null, 2)` (the data files' layout). `compact=true` drops all whitespace.
- Headers: `res.attachment('spainantennas-export-YYYY-MM-DDTHH-mm-ssZ.json')` (UTC, `exportFilename`), so `Content-Type: application/json; charset=utf-8`. No match -> 200 with `[]`.
- Streaming: `find(...).sort({ _id: 1 }).lean().cursor()`. The first document is read before any header is set, so an up-front DB error still gets the 500 JSON from `catchAsync`. The rest goes through `pipeline(exportChunks(...), res)`, one chunk per placement, with backpressure. The generator closes the cursor in `finally`, also when the client disconnects. A failure after the headers: log `Export stream failed:` and `res.destroy()`; the truncated body never ends with `]`. Never buffer the whole export (512 MB dyno).

Stats (`GET /stats`, `getStats`):

- Middleware: `getStatsValidation` -> `getStats`. Public.
- Query: only `status`, `type`, `technology` (same list rules as `/placement`, built with `buildPlacementFilter`). Anything else -> 400.
- Counts **placements** with `countDocuments`, never transmitters. Transmitter filters combine in one `$elemMatch`; a placement counts once however many transmitters match. No filter = every placement. Sites without coordinates are counted, so `totalCount` equals `/placement`'s `total` for the same filters.
- Response: 200 `{ status: "success", totalCount }` (0 when nothing matches). No caching.

Delete transmitter (`DELETE /transmitter/:placementId/:transmitterId`, `deleteTransmitter`):

- Middleware: `protect` -> `transmitterIdValidation` (both params `isMongoId`, errors reported together) -> `deleteTransmitter`. Body and query are ignored.
- Load, remove, save: `findById` -> `transmitters.id()` -> subdoc `deleteOne()` + `lastUpdate = now` -> `save()`. Not an atomic `$pull`, so the 404s differ: `No placement found with that ID` vs `No transmitter found with that ID`.
- Save errors: `ValidationError` -> 400 (Mongoose shape), `DocumentNotFoundError` (placement deleted meanwhile) -> placement 404.
- Success: 204, no body. The last transmitter may be deleted (placement keeps `[]`).
- Other methods -> 405 with `Allow: PUT, DELETE`.

Update transmitter (`PUT /transmitter/:placementId/:transmitterId`, `updateTransmitter`):

- Middleware: `protect` -> `updateTransmitterValidation` (both params `isMongoId` + the root-level `transmitterChains()`, all errors reported together) -> `updateTransmitter`. Query is ignored.
- Body: full replace, exactly the 7 transmitter fields, same rules as a transmitter in POST /placement (error paths `type`, `stationName`, ...). `_id`, `lastUpdate`, `placementId` or any other key -> 400 `Unknown field(s): ...`; a non-object body -> 400 `Body must be a JSON object`. Nullable fields omitted -> `null`.
- One atomic `updateOne({ _id: placementId, 'transmitters._id': transmitterId }, { $set: { 'transmitters.$': { _id: transmitterId, ...fields }, lastUpdate: now } }, { runValidators: true })`, not load/set/save (array-index race above). `_id` is passed explicitly, or Mongoose casts a new one. `lastUpdate` is stamped even when nothing changed.
- Update validators run the transmitter schema on `transmitters.$` and report `transmitters.0.<field>`; the `ValidationError` -> 400 (Mongoose shape) with paths remapped to the body field.
- `matchedCount === 0` -> `exists({ _id: placementId })`: `No placement found with that ID` or `No transmitter found with that ID` (404).
- Success: 200 `{ status: "success", data: { transmitter } }` with `_id` and the stored (trimmed, nulls filled) values.

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
- `docker/` holds the demo stack (`docker compose up --build`: seeded MongoDB, opensesame-back, this API; front to be added when it exists). Its Dockerfiles `git clone` opensesame-back and this repo from GitHub, so the demo runs pushed `master`, not local changes. Seed data lives in `docker/init-mongo.js` (real placements copied from `data/`, transmitters with `new ObjectId()`); keep it valid against the schema when the model changes. `docker/**` is ESLint-ignored (mongosh globals).
