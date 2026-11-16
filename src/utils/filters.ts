import { Types } from 'mongoose';

import {
  PlacementStatus,
  TransmitterTechnology,
  TransmitterType
} from '../models/spainantennasTypes';

// Filters once the query has been validated and sanitized: list filters are arrays, text
// filters trimmed strings.
type PlacementFieldFilters = {
  status?: PlacementStatus[];
  siteOperator?: string;
  postcode?: string[];
};

type TransmitterFieldFilters = {
  type?: TransmitterType[];
  technology?: TransmitterTechnology[];
  stationName?: string;
  broadcaster?: string;
};

/**
 * `GET /placement` filters. `id` holds placement ObjectIds.
 */
export type PlacementFilterQuery = PlacementFieldFilters &
  TransmitterFieldFilters & {
    id?: string[];
  };

/**
 * `GET /transmitter` filters. `placementId` holds placement ObjectIds.
 */
export type TransmitterFilterQuery = PlacementFieldFilters &
  TransmitterFieldFilters & {
    placementId?: string[];
  };

// Letters that match their accented variants (and vice versa) in text filters
const FOLD_GROUPS = ['aáàâäã', 'eéèêë', 'iíìîï', 'oóòôöõ', 'uúùûü', 'nñ', 'cç'];

// Every letter of a group (base or accented) maps to the whole group's character class
const FOLD_CLASSES = new Map(
  FOLD_GROUPS.flatMap((group) => [...group].map((char) => [char, `[${group}]`] as const))
);

// Characters safe to put in a regex as is. Others go through RegExp.escape, applied per
// character because on a whole string it hex-escapes a leading letter or digit.
// Whitespace stays literal: RegExp.escape writes it above U+00FF as `\uXXXX`, which
// MongoDB's PCRE2 rejects.
const LITERAL = /^[\p{L}\p{N}\s]$/u;

/**
 * Splits a comma-separated query value into trimmed items. Empty items are kept so the
 * validator can reject them.
 */
export const splitList = (value: string): string[] => value.split(',').map((item) => item.trim());

/**
 * Builds a case- and accent-insensitive partial-match regex for a user-supplied text.
 * Regex metacharacters are escaped. Vowels match their acute, grave, circumflex,
 * diaeresis and tilde forms, `n` matches `ñ` and `c` matches `ç`, in both directions.
 *
 * @example accentInsensitiveRegex('espana') // /esp[aáàâäã][nñ][aáàâäã]/i, matches 'España'
 */
export const accentInsensitiveRegex = (text: string): RegExp => {
  let source = '';
  for (const char of text.normalize('NFC')) {
    const foldClass = FOLD_CLASSES.get(char.toLowerCase());
    if (foldClass) {
      source += foldClass;
    } else {
      source += LITERAL.test(char) ? char : RegExp.escape(char);
    }
  }
  return new RegExp(source, 'i');
};

// Conditions on placement fields, shared by the placement and transmitter lists
const placementFieldConditions = (query: PlacementFieldFilters): Record<string, unknown> => {
  const conditions: Record<string, unknown> = {};
  if (query.status) conditions.status = { $in: query.status };
  if (query.siteOperator) conditions.siteOperator = accentInsensitiveRegex(query.siteOperator);
  if (query.postcode) conditions.postcode = { $in: query.postcode };
  return conditions;
};

// Conditions on one transmitter's fields, keys prefixed with `prefix` (e.g. `transmitters.`)
const transmitterConditions = (
  query: TransmitterFieldFilters,
  prefix = ''
): Record<string, unknown> => {
  const conditions: Record<string, unknown> = {};
  if (query.type) conditions[`${prefix}type`] = { $in: query.type };
  if (query.technology) conditions[`${prefix}technology`] = { $in: query.technology };
  if (query.stationName) {
    conditions[`${prefix}stationName`] = accentInsensitiveRegex(query.stationName);
  }
  if (query.broadcaster) {
    conditions[`${prefix}broadcaster`] = accentInsensitiveRegex(query.broadcaster);
  }
  return conditions;
};

// Placement fields plus the transmitter conditions in a single `$elemMatch`, so the same
// transmitter must match all of them
const placementLevelFilter = (
  query: PlacementFieldFilters & TransmitterFieldFilters
): Record<string, unknown> => {
  const filter = placementFieldConditions(query);
  const transmitter = transmitterConditions(query);
  if (Object.keys(transmitter).length > 0) {
    filter.transmitters = { $elemMatch: transmitter };
  }
  return filter;
};

/**
 * Builds the Mongo filter for `GET /placement`. Every filter is ANDed. Transmitter
 * filters go into a single `$elemMatch`, so the same transmitter must match all of them.
 */
export const buildPlacementFilter = (query: PlacementFilterQuery): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};
  if (query.id) filter._id = { $in: query.id };
  return { ...filter, ...placementLevelFilter(query) };
};

/**
 * Builds the two `$match` filters of the `GET /transmitter` aggregation. Every filter is
 * ANDed.
 *
 * - `placementMatch` runs before `$unwind`: placement filters plus an `$elemMatch` on the
 *   transmitter filters, keeping only placements with at least one matching transmitter.
 *   Placement ids are cast to ObjectId because aggregation does not cast.
 * - `transmitterMatch` runs after `$unwind` and drops the non-matching siblings. It is
 *   `undefined` when there is no transmitter filter.
 */
export const buildTransmitterPipelineFilters = (
  query: TransmitterFilterQuery
): {
  placementMatch: Record<string, unknown>;
  transmitterMatch: Record<string, unknown> | undefined;
} => {
  const placementMatch: Record<string, unknown> = {};
  if (query.placementId) {
    placementMatch._id = { $in: query.placementId.map((id) => new Types.ObjectId(id)) };
  }
  const transmitterMatch = transmitterConditions(query, 'transmitters.');
  return {
    placementMatch: { ...placementMatch, ...placementLevelFilter(query) },
    transmitterMatch: Object.keys(transmitterMatch).length > 0 ? transmitterMatch : undefined
  };
};
