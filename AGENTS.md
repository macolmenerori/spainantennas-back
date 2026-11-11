# AGENTS.md

Guidance for coding agents working on `spainantennas-back`.

## Project

Express + TypeScript API over MongoDB (Mongoose) serving radio/TV antenna sites in Spain. A future React front (`spainantennas-front`) will show them on a map. Deployed on Heroku (eco dynos). Mirrors the structure and conventions of [rainlogger-back](https://github.com/macolmenerori/rainlogger-back) and [opensesame-back](https://github.com/macolmenerori/opensesame-back): check those repos when unsure how something is done.

## Stack

- Node >= 24, TypeScript 6 (strict, CommonJS, `src/` -> `dist/`), pnpm 12 (always use `pnpm`).
- Single `tsconfig.json`: `module: nodenext` (emits CJS because package.json has no `"type": "module"`), `target: es2025` (`RegExp.escape` available), `isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. No `verbatimModuleSyntax` (rejects `import` in CJS-mode files). No source maps. No path alias yet (tsc doesn't rewrite `@/` imports; use relative imports).
- Tests are co-located as `src/**/*.test.ts` and excluded from `tsconfig.json`, so `tsc` never emits them (and `pnpm types` doesn't check them; neither does it check `scripts/`).
- `pnpm-workspace.yaml` `allowBuilds` lists packages allowed (or explicitly denied) to run install scripts; esbuild (via tsx) is denied, its binary works without it.
- Express 5, Mongoose, express-validator, helmet, cors (origin whitelist), express-rate-limit on `/api`, `@exortek/express-mongo-sanitize`, compression, multer (import upload).
- `dotenv` loads `.env` (gitignored); keep `.env.example` updated. `checkEnvVars()` exits on missing vars.
- ESLint (flat config, typescript-eslint, prettier, simple-import-sort) + Prettier.
- Vitest, unit tests only (mock Mongoose models and `fetch`; no real DB).
- swagger-jsdoc: `@openapi` JSDoc in `src/routes/*.ts`, generated to an OpenAPI file by `scripts/generateOpenapi.ts`.

## Commands (rainlogger style; missing ones still to create)

- `pnpm dev` (`nodemon --exec tsx src/server.ts`; tsx, not ts-node, also runs TS scripts), `pnpm build` (tsc), `pnpm start` (`node dist/server.js`)
- `pnpm lint` (`eslint --fix .`), `pnpm prettify` (`prettier -w .`, whole repo; `.prettierignore` excludes `data/`, `dist/`, lockfile, `description.md`), `pnpm types` (`tsc --noEmit`)
- ESLint (`eslint.config.mjs`) runs Prettier as a rule (`prettier/prettier`), so `pnpm lint` also fixes formatting. Non-type-aware `tseslint.configs.recommended`. Unused args ignored only if named `req|res|next|val` or `_`-prefixed. Import order enforced by simple-import-sort (`@macolmenerori` -> packages -> side-effect -> `../` -> `./`).
- `pnpm test` (vitest run), single test: `pnpm vitest run path/to/file.test.ts -t "name"`
- `pnpm verify`: audit -> lint -> prettify -> types -> test -> build (test step omitted until Vitest is set up)
- `pnpm generate:openapi` (`tsx scripts/generateOpenapi.ts`)

## Structure

`src/server.ts` (dotenv, env check, Mongo connect, listen) · `src/app.ts` (middleware, `/healthcheck`, routers, 404) · `src/routes/` · `src/controllers/` (incl. `authController.ts` with `protect`) · `src/models/` (schema + types) · `src/validations/` · `src/utils/` (`catchAsync`, `methodNotAllowed`, `checkEnvVars`, pagination, filter builders).

## Data model

One `placements` collection. Transmitters are **embedded subdocuments with their own Mongoose `_id`**. Schema follows `data/README.md` (read `data/AGENTS.md` for data conventions):

- Placement: `status` enum `active|inactive|unknown`; `siteOperator` string (`"unknown"` allowed); `location {lat, lon, altM}` (lat/lon required and range-checked, `altM` nullable); `postcode` nullable string; `transmitters` default `[]` (empty allowed); `lastUpdate` Date; `source` string.
- Transmitter: `type` enum `TV|radio`; `technology` enum `AM-LW|AM-MW|FM|TDT|DAB+`; `frequencykHz` nullable number (kHz, FM too); `stationName`, `broadcaster`, `source` required strings; `powerKw` nullable number.
- `stationName` is NOT unique within a placement (TV repeats channels across multiplexes). Always address a transmitter by its `_id`.
- `lastUpdate` is stamped by the server (now) on any placement or transmitter create/update/delete; client value ignored. Import keeps the file's `lastUpdate`.

## API

Base path `/api/v1`. Write endpoints use `protect` (any valid opensesame JWT; no role/permission check). Disallowed methods -> 405 via `methodNotAllowed`.

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
- Text filters (`siteOperator`, `stationName`, `broadcaster`) are escaped-regex, case- and accent-insensitive partial matches. `postcode` exact. Enums exact, comma lists allowed (`technology=FM,DAB%2B`). Single placement = `GET /placement?id=...`.

Pagination (all GETs except `/export`): `page` default 1, `perPage` default `DEFAULT_PERPAGE`, capped at `MAX_PERPAGE`. Stable default sort by `_id`.

Responses:

- List: `{ status: "success", page, perPage, totalPages, total, results: [...] }`
- Single: `{ status: "success", data: { placement | transmitter } }`
- Error: `{ status: "fail" | "error", message, errors? }` (400 validation, 401 auth, 404, 405, 500)

Import: run the API locally against the target DB for the big `data/*.json` files (Heroku has a 30 s request limit and 512 MB RAM). Size limit `IMPORT_MAX_SIZE_MB`; global `express.json` limit stays small. Validate each item with the Mongoose schema, `insertMany` in batches with `ordered: false`, ignore incoming `_id`s, respond `{ inserted, failed, errors: [{ index, message }] }`. No duplicate detection.

Export: stream a JSON array from a Mongoose cursor as an attachment, same shape as the data files plus `_id` on placements and transmitters (re-importable).

## Validation

express-validator chains in `src/validations/` for path params (`isMongoId`), query params, pagination and bodies; controller short-circuits with 400. Mongoose schema is the final guard and validates import items. Controllers build documents explicitly; never forward raw `req.body`.

## Environment variables

`NODE_ENV`, `PORT`, `DATABASE`, `AUTH_URL`, `CORS_WHITELIST`, `RATELIMIT_MAXCONNECTIONS`, `RATELIMIT_WINDOWMS`, `DEFAULT_PERPAGE`, `MAX_PERPAGE`, `IMPORT_MAX_SIZE_MB`.

## Notes

- `data/` is gitignored source data; never commit it or edit it from this repo.
- `description.md` is the original project brief, kept for reference and gitignored. This file is the source of truth when they differ.
- Git not initialized yet.
