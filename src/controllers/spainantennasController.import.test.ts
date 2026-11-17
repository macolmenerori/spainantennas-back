import { Response } from 'express';
import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlacementModel from '../models/spainantennasModel';
import { RequestWithUser } from '../models/userTypes';
import { IMPORT_BATCH_SIZE } from '../utils/consts';
import { importPlacementsValidation } from '../validations/spainantennas.validations';

import { importPlacements } from './spainantennasController';

// Real model (construction and validate() need no connection); only insertMany is stubbed

const FILE_DATE = '2026-11-04T12:00:00.000Z';

const transmitter = () => ({
  type: 'radio',
  technology: 'FM',
  frequencykHz: 88200,
  stationName: 'Radio Nacional',
  broadcaster: 'RTVE',
  powerKw: null,
  source: 'Ministry FM list'
});

const placement = (): Record<string, unknown> => ({
  status: 'active',
  siteOperator: 'Cellnex',
  location: { lat: 40.4168, lon: -3.7038, altM: 657 },
  postcode: '28001',
  transmitters: [transmitter()],
  lastUpdate: FILE_DATE,
  source: 'Ministry station data'
});

const jsonFile = (value: unknown) => Buffer.from(JSON.stringify(value));

/**
 * Runs the query chains, then importPlacements, and resolves once it responds.
 * catchAsync does not return the handler's promise, so we wait on res.json.
 */
const runImport = async (file?: Buffer, query: Record<string, unknown> = {}) => {
  const req = {
    query,
    file: file && ({ buffer: file } as Express.Multer.File)
  } as unknown as RequestWithUser;
  for (const chain of importPlacementsValidation) {
    await chain.run(req);
  }
  return new Promise<{ res: Response }>((resolve) => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(() => {
      resolve({ res });
      return res;
    });
    importPlacements(req, res, vi.fn());
  });
};

const body = (res: Response) => vi.mocked(res.json).mock.calls[0][0];

const bulkWriteError = (writeErrors: { index: number; errmsg: string }[], insertedCount: number) =>
  new mongoose.mongo.MongoBulkWriteError(
    {
      message: 'bulk write failed',
      code: 11000,
      // The driver does not export WriteError; the handler reads only index and errmsg
      writeErrors: writeErrors as unknown as mongoose.mongo.WriteError[]
    },
    { insertedCount } as mongoose.mongo.BulkWriteResult
  );

let insertManyMock: ReturnType<typeof vi.fn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  insertManyMock = vi.fn().mockImplementation(async (docs: unknown[]) => docs);
  vi.spyOn(PlacementModel, 'insertMany').mockImplementation(insertManyMock as never);
});

// Docs passed to every insertMany call, flattened
const insertedDocs = () =>
  insertManyMock.mock.calls.flatMap(([docs]) => docs as Record<string, unknown>[]);

describe('importPlacements: the file', () => {
  it('responds 400 when no file was uploaded', async () => {
    const { res } = await runImport();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res)).toEqual({ status: 'fail', message: 'No file uploaded' });
  });

  it.each([
    ['invalid JSON', Buffer.from('[{"status": ')],
    ['invalid UTF-8', Buffer.from([0x5b, 0x22, 0xff, 0x22, 0x5d])]
  ])('responds 400 on %s', async (_label, file) => {
    const { res } = await runImport(file);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res)).toEqual({ status: 'fail', message: 'Invalid JSON file' });
  });

  it('accepts a UTF-8 BOM', async () => {
    const file = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), jsonFile([placement()])]);

    const { res } = await runImport(file);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each([{ a: 1 }, 'text', 5, null])('responds 400 when the top level is %j', async (value) => {
    const { res } = await runImport(jsonFile(value));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res)).toEqual({ status: 'fail', message: 'File must contain a JSON array' });
  });

  it('responds 200 with zero counts for an empty array', async () => {
    const { res } = await runImport(jsonFile([]));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res)).toEqual({ status: 'success', inserted: 0, failed: 0, errors: [] });
    expect(insertManyMock).not.toHaveBeenCalled();
  });
});

describe('importPlacements: items', () => {
  it('inserts valid items, keeping lastUpdate and casting values', async () => {
    const item = placement();
    item.location = { lat: '40.4', lon: -3.7, altM: null };

    const { res } = await runImport(jsonFile([item]));

    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res)).toEqual({ status: 'success', inserted: 1, failed: 0, errors: [] });
    expect(insertManyMock).toHaveBeenCalledWith(expect.any(Array), {
      ordered: false,
      lean: true
    });
    const [doc] = insertedDocs();
    expect(doc.lastUpdate).toEqual(new Date(FILE_DATE));
    expect(doc.location).toEqual({ lat: 40.4, lon: -3.7, altM: null });
  });

  it('ignores incoming _id values on placements and transmitters', async () => {
    const placementId = '507f1f77bcf86cd799439011';
    const transmitterId = '507f1f77bcf86cd799439012';
    const item = { ...placement(), _id: placementId };
    item.transmitters = [{ ...transmitter(), _id: transmitterId }];

    await runImport(jsonFile([item]));

    const [doc] = insertedDocs();
    const [tx] = doc.transmitters as Record<string, unknown>[];
    expect(String(doc._id)).not.toBe(placementId);
    expect(String(tx._id)).not.toBe(transmitterId);
    expect(doc._id).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(tx._id).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it.each([
    ['missing', undefined],
    ['null', null]
  ])('stamps now when lastUpdate is %s', async (_label, lastUpdate) => {
    const item = placement();
    if (lastUpdate === undefined) {
      delete item.lastUpdate;
    } else {
      item.lastUpdate = lastUpdate;
    }

    // The schema default keeps the real Date.now, so fake timers would not reach it
    const before = Date.now();
    await runImport(jsonFile([item]));

    const stamped = insertedDocs()[0].lastUpdate as Date;
    expect(stamped.getTime()).toBeGreaterThanOrEqual(before);
    expect(stamped.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('fills nullable fields and defaults transmitters', async () => {
    const item = placement();
    delete item.postcode;
    delete item.transmitters;
    item.location = {};

    await runImport(jsonFile([item]));

    const [doc] = insertedDocs();
    expect(doc.postcode).toBeNull();
    expect(doc.transmitters).toEqual([]);
    expect(doc.location).toEqual({ lat: null, lon: null, altM: null });
  });

  it.each([
    ['a non-object item', 5, 'Item must be an object'],
    ['a null item', null, 'Item must be an object'],
    ['an array item', [], 'Item must be an object'],
    ['an unknown root key', { ...placement(), foo: 1 }, 'Unknown field: foo'],
    [
      'an unknown location key',
      { ...placement(), location: { lat: 40, lon: -3, altM: 1, bar: 2 } },
      'Unknown field: location.bar'
    ],
    [
      'an unknown key on the second transmitter',
      { ...placement(), transmitters: [transmitter(), { ...transmitter(), baz: 3 }] },
      'Unknown field: transmitters.1.baz'
    ],
    [
      'a transmitter that is not an object',
      { ...placement(), transmitters: [transmitter(), 'x'] },
      'transmitters.1: must be an object'
    ],
    [
      'transmitters that are not an array',
      { ...placement(), transmitters: 'x' },
      'transmitters: must be an array'
    ],
    [
      'a location that is not an object',
      { ...placement(), location: 'x' },
      'location: must be an object'
    ],
    [
      'an invalid date',
      { ...placement(), lastUpdate: 'yesterday' },
      'lastUpdate: Cast to date failed'
    ]
  ])('reports %s', async (_label, item, message) => {
    const { res } = await runImport(jsonFile([item]));

    expect(body(res).errors).toEqual([{ index: 0, message }]);
  });

  it('lists every failing path of an item', async () => {
    const item = placement();
    item.status = 'broken';
    item.location = { lat: 50, lon: null };
    item.transmitters = [{ ...transmitter(), type: 'satellite' }];

    const { res } = await runImport(jsonFile([item]));

    const { message } = body(res).errors[0];
    expect(message.split('; ').sort()).toEqual([
      'location.lat: lat must be between 27 and 44',
      'location.lon: lat and lon must both be set or both be null',
      'status: status must be one of: active, inactive, unknown',
      'transmitters.0.type: type must be one of: TV, radio'
    ]);
  });

  it('inserts the valid items and reports the rest by index, with 201', async () => {
    const items = [placement(), { ...placement(), status: 'x' }, placement(), 7];

    const { res } = await runImport(jsonFile(items));

    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res)).toEqual({
      status: 'success',
      inserted: 2,
      failed: 2,
      errors: [
        { index: 1, message: 'status: status must be one of: active, inactive, unknown' },
        { index: 3, message: 'Item must be an object' }
      ]
    });
    expect(insertedDocs()).toHaveLength(2);
  });

  it('responds 400 when no item is valid, without inserting', async () => {
    const { res } = await runImport(jsonFile([5, { ...placement(), foo: 1 }]));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res)).toEqual({
      status: 'fail',
      message: 'No placements imported',
      inserted: 0,
      failed: 2,
      errors: [
        { index: 0, message: 'Item must be an object' },
        { index: 1, message: 'Unknown field: foo' }
      ]
    });
    expect(insertManyMock).not.toHaveBeenCalled();
  });
});

describe('importPlacements: inserting', () => {
  it(`inserts in batches of ${IMPORT_BATCH_SIZE}`, async () => {
    const items = Array.from({ length: IMPORT_BATCH_SIZE + 1 }, placement);

    const { res } = await runImport(jsonFile(items));

    expect(insertManyMock).toHaveBeenCalledTimes(2);
    expect(insertManyMock.mock.calls[0][0]).toHaveLength(IMPORT_BATCH_SIZE);
    expect(insertManyMock.mock.calls[1][0]).toHaveLength(1);
    expect(body(res).inserted).toBe(IMPORT_BATCH_SIZE + 1);
  });

  it('maps write errors back to file indexes', async () => {
    // File index 1 is invalid, so the batch holds file indexes 0, 2, 3
    const items = [placement(), 5, placement(), placement()];
    insertManyMock.mockRejectedValueOnce(
      bulkWriteError([{ index: 1, errmsg: 'E11000 duplicate key error' }], 2)
    );

    const { res } = await runImport(jsonFile(items));

    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res)).toEqual({
      status: 'success',
      inserted: 2,
      failed: 2,
      errors: [
        { index: 1, message: 'Item must be an object' },
        { index: 2, message: 'E11000 duplicate key error' }
      ]
    });
  });

  it('responds 400 when every insert fails', async () => {
    insertManyMock.mockRejectedValueOnce(bulkWriteError([{ index: 0, errmsg: 'write failed' }], 0));

    const { res } = await runImport(jsonFile([placement()]));

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res)).toMatchObject({ inserted: 0, failed: 1, message: 'No placements imported' });
  });

  it('responds 500 on other DB errors after logging the progress', async () => {
    const items = Array.from({ length: IMPORT_BATCH_SIZE + 1 }, placement);
    const dbError = new Error('connection lost');
    insertManyMock.mockImplementationOnce(async (docs: unknown[]) => docs);
    insertManyMock.mockRejectedValueOnce(dbError);

    const { res } = await runImport(jsonFile(items));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Async error caught:', dbError);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Import aborted after inserting ${IMPORT_BATCH_SIZE} placements`
    );
  });
});

describe('importPlacements: dry run', () => {
  it('validates without inserting and responds 200', async () => {
    const { res } = await runImport(jsonFile([placement(), 5]), { dryRun: 'true' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res)).toEqual({
      status: 'success',
      dryRun: true,
      valid: 1,
      failed: 1,
      errors: [{ index: 1, message: 'Item must be an object' }]
    });
    expect(insertManyMock).not.toHaveBeenCalled();
  });

  it('responds 400 when no item is valid', async () => {
    const { res } = await runImport(jsonFile([5]), { dryRun: 'true' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res)).toEqual({
      status: 'fail',
      message: 'No valid placements',
      dryRun: true,
      valid: 0,
      failed: 1,
      errors: [{ index: 0, message: 'Item must be an object' }]
    });
  });

  it('responds 200 with zero counts for an empty array', async () => {
    const { res } = await runImport(jsonFile([]), { dryRun: 'true' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res)).toEqual({
      status: 'success',
      dryRun: true,
      valid: 0,
      failed: 0,
      errors: []
    });
  });

  it('inserts with dryRun=false', async () => {
    const { res } = await runImport(jsonFile([placement()]), { dryRun: 'false' });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(insertManyMock).toHaveBeenCalledTimes(1);
  });
});
