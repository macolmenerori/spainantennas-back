import { Request, Response } from 'express';
import { matchedData } from 'express-validator';
import mongoose, { PipelineStage } from 'mongoose';
import { pipeline } from 'stream/promises';

import PlacementModel from '../models/spainantennasModel';
import { Location, Placement, Transmitter } from '../models/spainantennasTypes';
import { RequestWithUser } from '../models/userTypes';
import catchAsync from '../utils/catchAsync';
import { checkValidation } from '../utils/checkValidation';
import { IMPORT_BATCH_SIZE } from '../utils/consts';
import {
  buildPlacementFilter,
  buildTransmitterPipelineFilters,
  PlacementFilterQuery,
  TransmitterFilterQuery
} from '../utils/filters';
import { buildListResponse, getPagination } from '../utils/pagination';

// Body shapes once express-validator has passed: nullable keys may be omitted
type TransmitterBody = Omit<Transmitter, 'frequencykHz' | 'powerKw'> &
  Partial<Pick<Transmitter, 'frequencykHz' | 'powerKw'>>;

type PlacementFieldsBody = Pick<Placement, 'status' | 'siteOperator' | 'source'> & {
  location: Partial<Location>;
  postcode?: string | null;
};

type PlacementBody = PlacementFieldsBody & { transmitters?: TransmitterBody[] };

// GET /placement query once validated and sanitized by getPlacementsValidation
type PlacementListQuery = PlacementFilterQuery & {
  page?: number;
  perPage?: number;
  fields?: 'summary';
};

// GET /transmitter query once validated and sanitized by getTransmittersValidation
type TransmitterListQuery = TransmitterFilterQuery & {
  page?: number;
  perPage?: number;
};

// POST /placement/import query once validated by importPlacementsValidation
type ImportQuery = { dryRun?: 'true' | 'false' };

// GET /export query once validated and sanitized by exportPlacementsValidation
type ExportQuery = Pick<PlacementFilterQuery, 'status' | 'postcode' | 'type' | 'technology'> & {
  compact?: 'true' | 'false';
};

// Lean placement as read by the export cursor
type ExportDocument = Record<string, unknown>;

// What the export generator needs from a Mongoose query cursor
type ExportCursor = {
  next: () => Promise<ExportDocument | null>;
  close: () => Promise<unknown>;
};

// One failed import item, by its position in the file
type ImportError = { index: number; message: string };

// A validated import item, ready for insertMany
type ValidImportItem = { index: number; doc: Placement };

// Shape of each GET /transmitter item, built from an unwound placement document
const TRANSMITTER_ITEM_PROJECTION = {
  _id: '$transmitters._id',
  placementId: '$_id',
  type: '$transmitters.type',
  technology: '$transmitters.technology',
  frequencykHz: '$transmitters.frequencykHz',
  stationName: '$transmitters.stationName',
  broadcaster: '$transmitters.broadcaster',
  powerKw: '$transmitters.powerKw',
  source: '$transmitters.source',
  placement: {
    status: '$status',
    siteOperator: '$siteOperator',
    location: '$location',
    postcode: '$postcode'
  }
};

// Placement fields a PUT may replace: everything but transmitters and lastUpdate
type PlacementFields = Omit<Placement, 'transmitters' | 'lastUpdate'>;

const buildTransmitter = (transmitter: TransmitterBody): Transmitter => ({
  type: transmitter.type,
  technology: transmitter.technology,
  frequencykHz: transmitter.frequencykHz ?? null,
  stationName: transmitter.stationName,
  broadcaster: transmitter.broadcaster,
  powerKw: transmitter.powerKw ?? null,
  source: transmitter.source
});

const buildPlacementFields = (body: PlacementFieldsBody): PlacementFields => ({
  status: body.status,
  siteOperator: body.siteOperator,
  location: {
    lat: body.location.lat ?? null,
    lon: body.location.lon ?? null,
    altM: body.location.altM ?? null
  },
  postcode: body.postcode ?? null,
  source: body.source
});

/**
 * Sends a Mongoose `ValidationError` as the same 400 shape express-validator produces.
 * Last guard: the schema rejected what express-validator let through.
 */
const sendMongooseValidationError = (res: Response, err: mongoose.Error.ValidationError) =>
  res.status(400).json({
    status: 'fail',
    message: 'Invalid input data',
    errors: Object.values(err.errors).map((error) => ({
      type: 'field',
      msg: error.message,
      path: error.path,
      location: 'body'
    }))
  });

const sendPlacementNotFound = (res: Response) =>
  res.status(404).json({
    status: 'fail',
    message: 'No placement found with that ID'
  });

/**
 * Lists placements, paginated and sorted by `_id`, from a query already checked by
 * `getPlacementsValidation`. Filters are ANDed; transmitter filters must match the same
 * transmitter, and matching placements return all their transmitters.
 * `fields=summary` leaves transmitters out. Public: no authentication.
 *
 * Responds 200 with the list shape (empty `results` when nothing matches), or 400 when
 * the query is invalid.
 */
export const getPlacements = catchAsync(async (req: Request, res: Response) => {
  const validation = checkValidation(req, res);
  if (validation !== undefined) {
    return validation;
  }

  // Sanitized values: Express 5 re-parses req.query, dropping express-validator's changes
  const { page, perPage, fields, ...filters } = matchedData(req, {
    locations: ['query']
  }) as PlacementListQuery;
  const pagination = getPagination(page, perPage);
  const filter = buildPlacementFilter(filters);
  const projection = fields === 'summary' ? { transmitters: 0 } : {};

  const [results, total] = await Promise.all([
    PlacementModel.find(filter, projection)
      .sort({ _id: 1 })
      .skip(pagination.skip)
      .limit(pagination.perPage)
      .lean(),
    PlacementModel.countDocuments(filter)
  ]);

  return res.status(200).json(buildListResponse(results, total, pagination));
});

/**
 * Lists transmitters, one item per transmitter with a slice of its placement, from a query
 * already checked by `getTransmittersValidation`. Filters are ANDed. Sorted by placement
 * `_id`, then by the transmitters' stored order: the sort runs on placements before
 * `$unwind`, so it uses the `_id` index instead of sorting every transmitter in memory.
 * Placements without transmitters yield nothing. Public: no authentication.
 *
 * Responds 200 with the list shape (empty `results` when nothing matches), or 400 when
 * the query is invalid.
 */
export const getTransmitters = catchAsync(async (req: Request, res: Response) => {
  const validation = checkValidation(req, res);
  if (validation !== undefined) {
    return validation;
  }

  // Sanitized values: Express 5 re-parses req.query, dropping express-validator's changes
  const { page, perPage, ...filters } = matchedData(req, {
    locations: ['query']
  }) as TransmitterListQuery;
  const pagination = getPagination(page, perPage);
  const { placementMatch, transmitterMatch } = buildTransmitterPipelineFilters(filters);
  const transmitterStages: PipelineStage[] = [
    { $unwind: '$transmitters' },
    ...(transmitterMatch ? [{ $match: transmitterMatch }] : [])
  ];

  const [results, countResult] = await Promise.all([
    PlacementModel.aggregate([
      { $match: placementMatch },
      { $sort: { _id: 1 } },
      ...transmitterStages,
      { $skip: pagination.skip },
      { $limit: pagination.perPage },
      { $project: TRANSMITTER_ITEM_PROJECTION }
    ]),
    PlacementModel.aggregate<{ total: number }>([
      { $match: placementMatch },
      ...transmitterStages,
      { $count: 'total' }
    ])
  ]);

  // $count emits no document when nothing matches
  const total = countResult[0]?.total ?? 0;
  return res.status(200).json(buildListResponse(results, total, pagination));
});

/**
 * Creates a placement, with optional transmitters, from a body already checked by
 * `createPlacementValidation`. The document is built field by field; `lastUpdate` is
 * always stamped by the server.
 *
 * Responds 201 with the new placement, or 400 when validation (express-validator or
 * Mongoose) fails.
 */
export const createPlacement = catchAsync(async (req: RequestWithUser, res: Response) => {
  const validation = checkValidation(req, res);
  if (validation !== undefined) {
    return validation;
  }

  const body = req.body as PlacementBody;
  const placement: Placement = {
    ...buildPlacementFields(body),
    transmitters: (body.transmitters ?? []).map(buildTransmitter),
    lastUpdate: new Date()
  };

  try {
    const newPlacement = await PlacementModel.create(placement);
    return res.status(201).json({
      status: 'success',
      data: { placement: newPlacement }
    });
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      return sendMongooseValidationError(res, err);
    }
    throw err;
  }
});

/**
 * Replaces the fields of the placement with the `id` path param, from a body already
 * checked by `updatePlacementValidation`. Transmitters are left untouched (the body cannot
 * carry them) and `lastUpdate` is stamped by the server. The document is loaded, set and
 * saved so the schema validators (lat/lon pair included) run.
 *
 * Responds 200 with the updated placement, 400 when validation (express-validator or
 * Mongoose) fails, or 404 when no placement has that id.
 */
export const updatePlacement = catchAsync(async (req: RequestWithUser, res: Response) => {
  const validation = checkValidation(req, res);
  if (validation !== undefined) {
    return validation;
  }

  const placement = await PlacementModel.findById(req.params.id);
  if (!placement) {
    return sendPlacementNotFound(res);
  }

  placement.set({
    ...buildPlacementFields(req.body as PlacementFieldsBody),
    lastUpdate: new Date()
  });

  try {
    await placement.save();
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      return sendMongooseValidationError(res, err);
    }
    // Deleted by another request between findById and save
    if (err instanceof mongoose.Error.DocumentNotFoundError) {
      return sendPlacementNotFound(res);
    }
    throw err;
  }

  return res.status(200).json({
    status: 'success',
    data: { placement }
  });
});

/**
 * Deletes a placement, with its embedded transmitters, by the `id` path param already
 * checked by `placementIdValidation`. Any body or query string is ignored.
 *
 * Responds 204 with no body, 400 on an invalid id, or 404 when no placement has that id.
 */
export const deletePlacement = catchAsync(async (req: RequestWithUser, res: Response) => {
  const validation = checkValidation(req, res);
  if (validation !== undefined) {
    return validation;
  }

  const placement = await PlacementModel.findByIdAndDelete(req.params.id);
  if (!placement) {
    return sendPlacementNotFound(res);
  }

  return res.status(204).send();
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Readies a parsed import item for the schema, in place: drops `_id` at the root and on
 * each transmitter (the DB assigns new ids, so an export can be re-imported) and a null
 * `lastUpdate` (the schema default stamps now, as it does for a missing one).
 */
const prepareImportItem = (item: Record<string, unknown>) => {
  delete item._id;
  if (item.lastUpdate === null) {
    delete item.lastUpdate;
  }
  if (Array.isArray(item.transmitters)) {
    for (const transmitter of item.transmitters) {
      if (isPlainObject(transmitter)) {
        delete transmitter._id;
      }
    }
  }
};

/**
 * One `path: message` entry for a field error of an import item. Mongoose cast errors on
 * subdocuments are verbose (they print the whole value) and report a bad transmitter as
 * `transmitters`, so they are rewritten: the transmitter index is recovered from the
 * failing value, and an unknown key reads `Unknown field: <path>`.
 */
const describeFieldError = (
  path: string,
  error: mongoose.Error.ValidatorError | mongoose.Error.CastError,
  item: Record<string, unknown>
): string => {
  if (!(error instanceof mongoose.Error.CastError)) {
    return `${path}: ${error.message}`;
  }

  if (path === 'transmitters' && !Array.isArray(item.transmitters)) {
    return 'transmitters: must be an array';
  }

  let fullPath = path;
  if (path === 'transmitters') {
    const index = (item.transmitters as unknown[]).indexOf(error.value);
    if (index !== -1) {
      fullPath = `transmitters.${index}`;
    }
  }

  if (error.reason instanceof mongoose.Error.StrictModeError) {
    return `Unknown field: ${fullPath}.${error.reason.path}`;
  }
  if (error.kind.toLowerCase() === 'embedded') {
    return `${fullPath}: must be an object`;
  }
  return `${fullPath}: Cast to ${error.kind} failed`;
};

/**
 * The error message of an import item that failed the schema: every failing path,
 * `path: message; path: message`.
 *
 * @returns The message, or `undefined` when `err` is not a schema error (rethrow it)
 */
const formatItemError = (err: unknown, item: Record<string, unknown>): string | undefined => {
  // An unknown root key, thrown by the constructor
  if (err instanceof mongoose.Error.StrictModeError) {
    return `Unknown field: ${err.path}`;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return Object.entries(err.errors)
      .map(([path, error]) => describeFieldError(path, error, item))
      .join('; ');
  }
  return undefined;
};

/**
 * Validates every import item against the Mongoose schema (casting allowed). Items that
 * are not objects or fail the schema are collected as errors, by file index.
 */
const validateImportItems = async (items: unknown[]) => {
  const valid: ValidImportItem[] = [];
  const errors: ImportError[] = [];

  for (const [index, item] of items.entries()) {
    if (!isPlainObject(item)) {
      errors.push({ index, message: 'Item must be an object' });
      continue;
    }

    prepareImportItem(item);
    try {
      const doc = new PlacementModel(item);
      await doc.validate();
      valid.push({ index, doc: doc.toObject() });
    } catch (err) {
      const message = formatItemError(err, item);
      if (message === undefined) {
        throw err;
      }
      errors.push({ index, message });
    }
  }

  return { valid, errors };
};

/**
 * Inserts validated items in batches of `IMPORT_BATCH_SIZE`, unordered, without
 * re-validating (`lean`). Per-document write errors are added to `errors` by file index;
 * any other DB error is rethrown, leaving earlier batches inserted.
 *
 * @returns How many placements were inserted
 */
const insertImportItems = async (valid: ValidImportItem[], errors: ImportError[]) => {
  let inserted = 0;

  for (let start = 0; start < valid.length; start += IMPORT_BATCH_SIZE) {
    const batch = valid.slice(start, start + IMPORT_BATCH_SIZE);
    try {
      await PlacementModel.insertMany(
        batch.map((item) => item.doc),
        { ordered: false, lean: true }
      );
      inserted += batch.length;
    } catch (err) {
      const writeErrors =
        err instanceof mongoose.mongo.MongoBulkWriteError ? [err.writeErrors].flat() : [];
      if (writeErrors.length === 0) {
        // eslint-disable-next-line no-console
        console.error(`Import aborted after inserting ${inserted} placements`);
        throw err;
      }
      // writeError.index is the position inside the batch
      for (const writeError of writeErrors) {
        errors.push({
          index: batch[writeError.index].index,
          message: writeError.errmsg ?? 'Write failed'
        });
      }
      inserted += (err as mongoose.mongo.MongoBulkWriteError).insertedCount;
    }
  }

  return inserted;
};

/**
 * Parses the uploaded import file: strict UTF-8 (a BOM is dropped), then JSON.
 *
 * @returns The parsed value, or `undefined` when the file is not valid UTF-8 JSON
 */
const parseImportFile = (buffer: Buffer): unknown => {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch {
    return undefined;
  }
};

/**
 * Imports placements from the uploaded JSON file (`req.file`, set by `uploadImportFile`):
 * an array in the data-file format. Each item is validated with the Mongoose schema;
 * valid ones are inserted (new ids, the file's `lastUpdate` kept), invalid ones are
 * reported by index. No duplicate detection. With `?dryRun=true` nothing is written.
 *
 * Responds:
 * - 201 `{ status, inserted, failed, errors }` when at least one placement was inserted
 * - 200 with zero counts for an empty array
 * - 400 when nothing was inserted (same keys plus `message`), the file is missing, not
 *   valid JSON or not an array
 * - dry run: 200 `{ status, dryRun, valid, failed, errors }`, or 400 when no item is valid
 */
export const importPlacements = catchAsync(async (req: RequestWithUser, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ status: 'fail', message: 'No file uploaded' });
  }

  const items = parseImportFile(req.file.buffer);
  if (items === undefined) {
    return res.status(400).json({ status: 'fail', message: 'Invalid JSON file' });
  }
  if (!Array.isArray(items)) {
    return res.status(400).json({ status: 'fail', message: 'File must contain a JSON array' });
  }

  const { dryRun } = matchedData(req, { locations: ['query'] }) as ImportQuery;
  const { valid, errors } = await validateImportItems(items);

  if (dryRun === 'true') {
    const summary = { dryRun: true, valid: valid.length, failed: errors.length, errors };
    if (valid.length === 0 && errors.length > 0) {
      return res.status(400).json({ status: 'fail', message: 'No valid placements', ...summary });
    }
    return res.status(200).json({ status: 'success', ...summary });
  }

  const inserted = await insertImportItems(valid, errors);
  errors.sort((a, b) => a.index - b.index);
  const summary = { inserted, failed: errors.length, errors };

  if (inserted > 0) {
    return res.status(201).json({ status: 'success', ...summary });
  }
  if (errors.length > 0) {
    return res.status(400).json({ status: 'fail', message: 'No placements imported', ...summary });
  }
  return res.status(200).json({ status: 'success', ...summary });
});

/**
 * Attachment name for an export: `spainantennas-export-YYYY-MM-DDTHH-mm-ssZ.json`, from the
 * UTC time `date` (`:` replaced by `-`, milliseconds dropped).
 */
export const exportFilename = (date: Date): string =>
  `spainantennas-export-${date.toISOString().slice(0, 19).replaceAll(':', '-')}Z.json`;

/**
 * Yields the export as JSON array text, one chunk per placement, starting from `first` (the
 * cursor's first document, already read). Pretty output is byte for byte
 * `JSON.stringify(docs, null, 2)`, the data files' layout; compact output has no
 * whitespace. The cursor is closed when the generator ends, including when the response
 * is aborted.
 */
async function* exportChunks(
  cursor: ExportCursor,
  first: ExportDocument,
  compact: boolean
): AsyncGenerator<string> {
  // JSON.stringify escapes newlines inside strings, so every raw newline is indentation
  const format = compact
    ? (doc: ExportDocument) => JSON.stringify(doc)
    : (doc: ExportDocument) => `  ${JSON.stringify(doc, null, 2).replaceAll('\n', '\n  ')}`;
  const separator = compact ? ',' : ',\n';

  try {
    yield `[${compact ? '' : '\n'}${format(first)}`;
    for (let doc = await cursor.next(); doc !== null; doc = await cursor.next()) {
      yield separator + format(doc);
    }
    yield compact ? ']' : '\n]';
  } finally {
    // Closing only frees the server-side cursor: the export is already done or aborted
    await cursor.close().catch(() => undefined);
  }
}

/**
 * Exports placements as a JSON array attachment, from a query already checked by
 * `exportPlacementsValidation`: every placement by default, or those matching the
 * `status`, `postcode`, `type` and `technology` filters (ANDed; transmitter filters must
 * match the same transmitter, and matching placements keep all their transmitters).
 * Sorted by `_id`, `_id` included on placements and transmitters, so the file can be
 * re-imported. Pretty-printed (2 spaces) unless `compact=true`. Requires authentication.
 *
 * The placements are streamed from a cursor, never held in memory together. The headers
 * are sent once the first document is read, so a query that fails up front still gets the
 * 500 JSON. A failure after that cannot change the response: it is logged and the
 * connection destroyed, so the client sees an aborted download, not a truncated file.
 *
 * Responds 200 with the attachment (`[]` when nothing matches), or 400 when the query is
 * invalid.
 */
export const exportPlacements = catchAsync(async (req: RequestWithUser, res: Response) => {
  const validation = checkValidation(req, res);
  if (validation !== undefined) {
    return validation;
  }

  // Sanitized values: Express 5 re-parses req.query, dropping express-validator's changes
  const { compact, ...filters } = matchedData(req, { locations: ['query'] }) as ExportQuery;
  const filename = exportFilename(new Date());
  const cursor: ExportCursor = PlacementModel.find(buildPlacementFilter(filters))
    .sort({ _id: 1 })
    .lean<ExportDocument>()
    .cursor();

  let first: ExportDocument | null;
  try {
    first = await cursor.next();
  } catch (err) {
    await cursor.close().catch(() => undefined);
    throw err;
  }

  res.status(200).attachment(filename);
  if (first === null) {
    await cursor.close().catch(() => undefined);
    return res.send('[]');
  }

  try {
    await pipeline(exportChunks(cursor, first, compact === 'true'), res);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Export stream failed:', err);
    res.destroy();
  }
});
