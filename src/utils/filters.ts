import {
  PlacementStatus,
  TransmitterTechnology,
  TransmitterType
} from '../models/spainantennasTypes';

/**
 * Placement filters once the query has been validated and sanitized: list filters are
 * arrays, text filters trimmed strings.
 */
export type PlacementFilterQuery = {
  id?: string[];
  status?: PlacementStatus[];
  siteOperator?: string;
  postcode?: string[];
  type?: TransmitterType[];
  technology?: TransmitterTechnology[];
  stationName?: string;
  broadcaster?: string;
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

/**
 * Builds the Mongo filter for `GET /placement`. Every filter is ANDed. Transmitter
 * filters go into a single `$elemMatch`, so the same transmitter must match all of them.
 */
export const buildPlacementFilter = (query: PlacementFilterQuery): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};

  if (query.id) filter._id = { $in: query.id };
  if (query.status) filter.status = { $in: query.status };
  if (query.siteOperator) filter.siteOperator = accentInsensitiveRegex(query.siteOperator);
  if (query.postcode) filter.postcode = { $in: query.postcode };

  const transmitter: Record<string, unknown> = {};
  if (query.type) transmitter.type = { $in: query.type };
  if (query.technology) transmitter.technology = { $in: query.technology };
  if (query.stationName) transmitter.stationName = accentInsensitiveRegex(query.stationName);
  if (query.broadcaster) transmitter.broadcaster = accentInsensitiveRegex(query.broadcaster);
  if (Object.keys(transmitter).length > 0) {
    filter.transmitters = { $elemMatch: transmitter };
  }

  return filter;
};
