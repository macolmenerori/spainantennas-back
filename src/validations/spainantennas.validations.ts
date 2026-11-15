import { body, param, ValidationChain } from 'express-validator';

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
 */
const onlyKeys = (allowed: readonly string[]) => (value: Record<string, unknown>) => {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown field(s): ${unknown.join(', ')}`);
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

const transmitterChains = (prefix: string): ValidationChain[] => [
  body(prefix)
    .custom(isPlainObject)
    .withMessage('Each transmitter must be an object')
    .bail()
    .custom(onlyKeys(TRANSMITTER_KEYS)),
  requiredEnum(`${prefix}.type`, TRANSMITTER_TYPES),
  requiredEnum(`${prefix}.technology`, TRANSMITTER_TECHNOLOGIES),
  nullableNumber(`${prefix}.frequencykHz`, {
    test: (value) => value > 0,
    message: 'frequencykHz must be greater than 0'
  }),
  requiredString(`${prefix}.stationName`, MAX_NAME_LENGTH),
  requiredString(`${prefix}.broadcaster`, MAX_NAME_LENGTH),
  nullableNumber(`${prefix}.powerKw`, {
    test: (value) => value >= 0,
    message: 'powerKw must be 0 or greater'
  }),
  requiredString(`${prefix}.source`, MAX_SOURCE_LENGTH)
];

export const createPlacementValidation: ValidationChain[] = [
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
  body('transmitters')
    .optional()
    .custom((value) => Array.isArray(value))
    .withMessage('transmitters must be an array'),
  ...transmitterChains('transmitters.*'),
  requiredString('source', MAX_SOURCE_LENGTH)
];

export const placementIdValidation: ValidationChain[] = [
  param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId')
];
