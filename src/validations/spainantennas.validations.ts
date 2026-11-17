import { body, param, query, ValidationChain } from 'express-validator';

import {
  Location,
  MAX_NAME_LENGTH,
  MAX_SOURCE_LENGTH,
  Placement,
  PLACEMENT_STATUSES,
  POSTCODE_REGEX,
  SPAIN_BOUNDS,
  Transmitter,
  TRANSMITTER_TECHNOLOGIES,
  TRANSMITTER_TYPES
} from '../models/spainantennasTypes';
import { MAX_FILTER_LIST_ITEMS } from '../utils/consts';
import { splitList } from '../utils/filters';

// Keys accepted in each body object. Anything else is rejected, mirroring the schema's
// `strict: 'throw'`. `lastUpdate` is accepted but ignored (the server stamps it). `_id` is
// never accepted: the server owns ids.
const PLACEMENT_KEYS = [
  'status',
  'siteOperator',
  'location',
  'postcode',
  'transmitters',
  'lastUpdate',
  'source'
] as const satisfies readonly (keyof Placement)[];
const LOCATION_KEYS = ['lat', 'lon', 'altM'] as const satisfies readonly (keyof Location)[];
const TRANSMITTER_KEYS = [
  'type',
  'technology',
  'frequencykHz',
  'stationName',
  'broadcaster',
  'powerKw',
  'source'
] as const satisfies readonly (keyof Transmitter)[];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Strict JSON number: no numeric strings
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

// Last segment of a field path, used in messages ('transmitters.*.source' -> 'source')
const label = (field: string): string => field.split('.').pop()!;

/**
 * Custom validator that fails when the object has keys outside `allowed`.
 * Must run after the value is known to be a plain object.
 *
 * @param noun - What a key is called in the error message ('field', 'query parameter')
 */
const onlyKeys =
  (allowed: readonly string[], noun = 'field') =>
  (value: Record<string, unknown>) => {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      throw new Error(`Unknown ${noun}(s): ${unknown.join(', ')}`);
    }
    return true;
  };

const requiredString = (field: string, maxLength: number): ValidationChain =>
  body(field)
    .exists({ values: 'null' })
    .withMessage(`${label(field)} is required`)
    .bail()
    .isString()
    .withMessage(`${label(field)} must be a string`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${label(field)} cannot be empty`)
    .bail()
    .isLength({ max: maxLength })
    .withMessage(`${label(field)} must be at most ${maxLength} characters`);

const requiredEnum = (field: string, values: readonly string[]): ValidationChain =>
  body(field)
    .exists({ values: 'null' })
    .withMessage(`${label(field)} is required`)
    .bail()
    .isString()
    .withMessage(`${label(field)} must be a string`)
    .bail()
    .isIn(values)
    .withMessage(`${label(field)} must be one of: ${values.join(', ')}`);

/**
 * Number that may be omitted or null. `range` adds an extra check on the value.
 */
const nullableNumber = (
  field: string,
  range?: { test: (value: number) => boolean; message: string }
): ValidationChain => {
  const chain = body(field)
    .optional({ values: 'null' })
    .custom(isNumber)
    .withMessage(`${label(field)} must be a number`);
  return range ? chain.bail().custom(range.test).withMessage(range.message) : chain;
};

/**
 * Chains for one transmitter object. With `prefix` (`transmitters.*`) they check each item
 * of a placement's array; without it, the request body itself is the transmitter.
 */
const transmitterChains = (prefix?: string): ValidationChain[] => {
  const path = (field: string) => (prefix ? `${prefix}.${field}` : field);
  return [
    body(prefix)
      .custom(isPlainObject)
      .withMessage(prefix ? 'Each transmitter must be an object' : 'Body must be a JSON object')
      .bail()
      .custom(onlyKeys(TRANSMITTER_KEYS)),
    requiredEnum(path('type'), TRANSMITTER_TYPES),
    requiredEnum(path('technology'), TRANSMITTER_TECHNOLOGIES),
    nullableNumber(path('frequencykHz'), {
      test: (value) => value > 0,
      message: 'frequencykHz must be greater than 0'
    }),
    requiredString(path('stationName'), MAX_NAME_LENGTH),
    requiredString(path('broadcaster'), MAX_NAME_LENGTH),
    nullableNumber(path('powerKw'), {
      test: (value) => value >= 0,
      message: 'powerKw must be 0 or greater'
    }),
    requiredString(path('source'), MAX_SOURCE_LENGTH)
  ];
};

/**
 * Chains shared by create and update: root shape and every placement field except
 * `transmitters`, which each caller validates (create) or rejects (update) itself.
 */
const placementFieldChains = (): ValidationChain[] => [
  body()
    .custom(isPlainObject)
    .withMessage('Body must be a JSON object')
    .bail()
    .custom(onlyKeys(PLACEMENT_KEYS)),
  requiredEnum('status', PLACEMENT_STATUSES),
  requiredString('siteOperator', MAX_NAME_LENGTH),
  body('location')
    .exists({ values: 'null' })
    .withMessage('location is required')
    .bail()
    .custom(isPlainObject)
    .withMessage('location must be an object')
    .bail()
    .custom(onlyKeys(LOCATION_KEYS))
    .bail()
    .custom((location: Partial<Location>) => (location.lat == null) === (location.lon == null))
    .withMessage('lat and lon must both be set or both be null'),
  nullableNumber('location.lat', {
    test: (value) => value >= SPAIN_BOUNDS.latMin && value <= SPAIN_BOUNDS.latMax,
    message: `lat must be between ${SPAIN_BOUNDS.latMin} and ${SPAIN_BOUNDS.latMax}`
  }),
  nullableNumber('location.lon', {
    test: (value) => value >= SPAIN_BOUNDS.lonMin && value <= SPAIN_BOUNDS.lonMax,
    message: `lon must be between ${SPAIN_BOUNDS.lonMin} and ${SPAIN_BOUNDS.lonMax}`
  }),
  nullableNumber('location.altM'),
  body('postcode')
    .optional({ values: 'null' })
    .isString()
    .withMessage('postcode must be a string')
    .bail()
    .trim()
    .matches(POSTCODE_REGEX)
    .withMessage('postcode must be 5 digits'),
  requiredString('source', MAX_SOURCE_LENGTH)
];

export const createPlacementValidation: ValidationChain[] = [
  ...placementFieldChains(),
  body('transmitters')
    .optional()
    .custom((value) => Array.isArray(value))
    .withMessage('transmitters must be an array'),
  ...transmitterChains('transmitters.*')
];

export const placementIdValidation: ValidationChain[] = [
  param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId')
];

export const transmitterIdValidation: ValidationChain[] = [
  param('placementId').isMongoId().withMessage('placementId must be a valid MongoDB ObjectId'),
  param('transmitterId').isMongoId().withMessage('transmitterId must be a valid MongoDB ObjectId')
];

// Full replace of one transmitter: exactly the transmitter fields (no `_id`, no
// `lastUpdate`). Id and body errors are reported together.
export const updateTransmitterValidation: ValidationChain[] = [
  ...transmitterIdValidation,
  ...transmitterChains()
];

// Any `transmitters` key fails, even [] or null: transmitters have their own endpoints.
// The root `onlyKeys` still allows the key, so it is reported once, with this message.
export const updatePlacementValidation: ValidationChain[] = [
  ...placementIdValidation,
  ...placementFieldChains(),
  body('transmitters')
    .not()
    .exists()
    .withMessage('transmitters cannot be changed here; use the transmitter endpoints')
];

// Query parameters accepted by GET /placement. Anything else is rejected.
const PLACEMENT_QUERY_KEYS = [
  'page',
  'perPage',
  'fields',
  'id',
  'status',
  'siteOperator',
  'postcode',
  'type',
  'technology',
  'stationName',
  'broadcaster'
] as const;

export const PLACEMENT_FIELDS_VALUES = ['summary'] as const;

// Same check as isMongoId: 24 hex characters
const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

/**
 * Optional query parameter given at most once (a repeated key arrives as an array).
 */
const singleQueryValue = (field: string): ValidationChain =>
  query(field).optional().isString().withMessage(`${field} must be given only once`).bail();

const paginationQuery = (field: string): ValidationChain =>
  singleQueryValue(field)
    .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
    .withMessage(`${field} must be a positive integer`)
    .bail()
    .toInt();

/**
 * Comma-separated list (`a,b,c`): non-empty, no empty items, at most
 * `MAX_FILTER_LIST_ITEMS` items, each passing `isValidItem`. Sanitized to an array of
 * trimmed items.
 */
const listQuery = (
  field: string,
  isValidItem: (item: string) => boolean,
  itemMessage: string
): ValidationChain =>
  singleQueryValue(field)
    .notEmpty()
    .withMessage(`${field} cannot be empty`)
    .bail()
    .custom((value: string) => {
      const items = splitList(value);
      if (items.length > MAX_FILTER_LIST_ITEMS) {
        throw new Error(`${field} accepts at most ${MAX_FILTER_LIST_ITEMS} values`);
      }
      if (items.includes('')) {
        throw new Error(`${field} cannot contain empty values`);
      }
      if (!items.every(isValidItem)) {
        throw new Error(itemMessage);
      }
      return true;
    })
    .bail()
    .customSanitizer(splitList);

const enumListQuery = (field: string, values: readonly string[]): ValidationChain =>
  listQuery(
    field,
    (item) => values.includes(item),
    `${field} must be one of: ${values.join(', ')}`
  );

// Single partial-match term: commas are part of the text, not separators
const textQuery = (field: string): ValidationChain =>
  singleQueryValue(field)
    .trim()
    .notEmpty()
    .withMessage(`${field} cannot be empty`)
    .bail()
    .isLength({ max: MAX_NAME_LENGTH })
    .withMessage(`${field} must be at most ${MAX_NAME_LENGTH} characters`);

const objectIdListQuery = (field: string): ValidationChain =>
  listQuery(
    field,
    (item) => OBJECT_ID_REGEX.test(item),
    `${field} must be a valid MongoDB ObjectId (or a comma-separated list of them)`
  );

const postcodeListQuery = (): ValidationChain =>
  listQuery(
    'postcode',
    (item) => POSTCODE_REGEX.test(item),
    'postcode must be 5 digits (or a comma-separated list of them)'
  );

// Placement and transmitter filters shared by GET /placement and GET /transmitter
const sharedFilterChains = (): ValidationChain[] => [
  enumListQuery('status', PLACEMENT_STATUSES),
  textQuery('siteOperator'),
  postcodeListQuery(),
  enumListQuery('type', TRANSMITTER_TYPES),
  enumListQuery('technology', TRANSMITTER_TECHNOLOGIES),
  textQuery('stationName'),
  textQuery('broadcaster')
];

/**
 * GET /placement query. Express 5 re-parses `req.query` on every access, so sanitized
 * values (ints, trimmed text, split lists) must be read with `matchedData()`.
 */
export const getPlacementsValidation: ValidationChain[] = [
  query().custom(onlyKeys(PLACEMENT_QUERY_KEYS, 'query parameter')),
  paginationQuery('page'),
  paginationQuery('perPage'),
  singleQueryValue('fields')
    .isIn(PLACEMENT_FIELDS_VALUES)
    .withMessage(`fields must be one of: ${PLACEMENT_FIELDS_VALUES.join(', ')}`),
  objectIdListQuery('id'),
  ...sharedFilterChains()
];

// Query parameters accepted by GET /transmitter. Anything else is rejected.
const TRANSMITTER_QUERY_KEYS = [
  'page',
  'perPage',
  'placementId',
  'status',
  'siteOperator',
  'postcode',
  'type',
  'technology',
  'stationName',
  'broadcaster'
] as const;

/**
 * GET /transmitter query. Same rules as GET /placement; the placement id filter is
 * `placementId` and there is no `fields`. Read sanitized values with `matchedData()`.
 */
export const getTransmittersValidation: ValidationChain[] = [
  query().custom(onlyKeys(TRANSMITTER_QUERY_KEYS, 'query parameter')),
  paginationQuery('page'),
  paginationQuery('perPage'),
  objectIdListQuery('placementId'),
  ...sharedFilterChains()
];

// Query parameters accepted by POST /placement/import. Anything else is rejected.
const IMPORT_QUERY_KEYS = ['dryRun'] as const;

export const IMPORT_DRY_RUN_VALUES = ['true', 'false'] as const;

/**
 * POST /placement/import query: only `dryRun` (`true` or `false`, given once). Runs before
 * the upload, so a bad query is rejected without buffering the file. Read the value with
 * `matchedData()`.
 */
export const importPlacementsValidation: ValidationChain[] = [
  query().custom(onlyKeys(IMPORT_QUERY_KEYS, 'query parameter')),
  singleQueryValue('dryRun')
    .isIn(IMPORT_DRY_RUN_VALUES)
    .withMessage(`dryRun must be one of: ${IMPORT_DRY_RUN_VALUES.join(', ')}`)
];

// Query parameters accepted by GET /export. Anything else is rejected.
const EXPORT_QUERY_KEYS = ['status', 'postcode', 'type', 'technology', 'compact'] as const;

export const EXPORT_COMPACT_VALUES = ['true', 'false'] as const;

/**
 * GET /export query: the `status`, `postcode`, `type` and `technology` filters (same rules
 * as GET /placement) and `compact` (`true` or `false`, given once). No pagination. Read
 * sanitized values with `matchedData()`.
 */
export const exportPlacementsValidation: ValidationChain[] = [
  query().custom(onlyKeys(EXPORT_QUERY_KEYS, 'query parameter')),
  enumListQuery('status', PLACEMENT_STATUSES),
  postcodeListQuery(),
  enumListQuery('type', TRANSMITTER_TYPES),
  enumListQuery('technology', TRANSMITTER_TECHNOLOGIES),
  singleQueryValue('compact')
    .isIn(EXPORT_COMPACT_VALUES)
    .withMessage(`compact must be one of: ${EXPORT_COMPACT_VALUES.join(', ')}`)
];

// Query parameters accepted by GET /stats. Anything else is rejected.
const STATS_QUERY_KEYS = ['status', 'type', 'technology'] as const;

/**
 * GET /stats query: the `status`, `type` and `technology` filters (same rules as
 * GET /placement). No pagination. Read sanitized values with `matchedData()`.
 */
export const getStatsValidation: ValidationChain[] = [
  query().custom(onlyKeys(STATS_QUERY_KEYS, 'query parameter')),
  enumListQuery('status', PLACEMENT_STATUSES),
  enumListQuery('type', TRANSMITTER_TYPES),
  enumListQuery('technology', TRANSMITTER_TECHNOLOGIES)
];
