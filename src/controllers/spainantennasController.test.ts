import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Writable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PlacementModel from '../models/spainantennasModel';
import { RequestWithUser } from '../models/userTypes';
import { accentInsensitiveRegex } from '../utils/filters';
import {
  createPlacementValidation,
  exportPlacementsValidation,
  getPlacementsValidation,
  getStatsValidation,
  getTransmittersValidation,
  placementIdValidation,
  transmitterIdValidation,
  updatePlacementValidation
} from '../validations/spainantennas.validations';

import {
  createPlacement,
  deletePlacement,
  deleteTransmitter,
  exportFilename,
  exportPlacements,
  getPlacements,
  getStats,
  getTransmitters,
  updatePlacement
} from './spainantennasController';

vi.mock('../models/spainantennasModel', () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    aggregate: vi.fn()
  }
}));

const aggregateMock = vi.mocked(PlacementModel.aggregate);

const createMock = vi.mocked(PlacementModel.create);
const findByIdMock = vi.mocked(PlacementModel.findById);
const findByIdAndDeleteMock = vi.mocked(PlacementModel.findByIdAndDelete);
const findMock = vi.mocked(PlacementModel.find);
const countDocumentsMock = vi.mocked(PlacementModel.countDocuments);

const NOW = new Date('2026-11-13T10:00:00.000Z');

const transmitter = () => ({
  type: 'radio',
  technology: 'FM',
  frequencykHz: 88200,
  stationName: 'Radio Nacional',
  broadcaster: 'RTVE',
  powerKw: 10,
  source: 'Ministry FM list'
});

/**
 * Runs the validation chains, then createPlacement, and resolves once it responds.
 * catchAsync does not return the handler's promise, so we wait on res.json.
 */
const runCreate = async (body: unknown) => {
  const req = { body } as RequestWithUser;
  for (const chain of createPlacementValidation) {
    await chain.run(req);
  }
  return new Promise<Response>((resolve) => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(() => {
      resolve(res);
      return res;
    });
    createPlacement(req, res, vi.fn());
  });
};

describe('createPlacement', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createMock.mockReset();
    createMock.mockImplementation((async (doc: object) => ({
      _id: '507f1f77bcf86cd799439011',
      ...doc
    })) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('responds 400 without creating when validation fails', async () => {
    const res = await runCreate({ status: 'active' });

    expect(createMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'Invalid input data',
        errors: expect.arrayContaining([expect.objectContaining({ path: 'siteOperator' })])
      })
    );
  });

  it('fills nullable fields, defaults transmitters and stamps lastUpdate', async () => {
    const res = await runCreate({
      status: 'unknown',
      siteOperator: '  unknown ',
      location: {},
      lastUpdate: '2020-01-01T00:00:00.000Z',
      source: 'manual'
    });

    const expected = {
      status: 'unknown',
      siteOperator: 'unknown',
      location: { lat: null, lon: null, altM: null },
      postcode: null,
      transmitters: [],
      lastUpdate: NOW,
      source: 'manual'
    };
    expect(createMock).toHaveBeenCalledWith(expected);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: { placement: { _id: '507f1f77bcf86cd799439011', ...expected } }
    });
  });

  it('builds each transmitter explicitly', async () => {
    const withoutNullables: Partial<ReturnType<typeof transmitter>> = transmitter();
    delete withoutNullables.frequencykHz;
    delete withoutNullables.powerKw;
    await runCreate({
      status: 'active',
      siteOperator: 'Cellnex',
      location: { lat: 40.4, lon: -3.7, altM: 657 },
      postcode: '28001',
      transmitters: [transmitter(), withoutNullables],
      source: 'Ministry'
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        location: { lat: 40.4, lon: -3.7, altM: 657 },
        postcode: '28001',
        transmitters: [transmitter(), { ...withoutNullables, frequencykHz: null, powerKw: null }]
      })
    );
  });

  it('responds 400 when Mongoose rejects the document', async () => {
    const validationError = new mongoose.Error.ValidationError();
    validationError.addError(
      'transmitters.0.source',
      new mongoose.Error.ValidatorError({
        message: 'A transmitter source must be provided',
        path: 'transmitters.0.source'
      })
    );
    createMock.mockRejectedValue(validationError);

    const res = await runCreate({
      status: 'active',
      siteOperator: 'Cellnex',
      location: {},
      source: 'Ministry'
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid input data',
      errors: [
        {
          type: 'field',
          msg: 'A transmitter source must be provided',
          path: 'transmitters.0.source',
          location: 'body'
        }
      ]
    });
  });

  it('responds 500 on other errors', async () => {
    createMock.mockRejectedValue(new Error('connection lost'));

    const res = await runCreate({
      status: 'active',
      siteOperator: 'Cellnex',
      location: {},
      source: 'Ministry'
    });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });
});

/**
 * Runs the id validation, then deletePlacement, and resolves once it responds
 * (res.json for errors, res.send for the 204).
 */
const runDelete = async (id: string) => {
  const req = { params: { id }, body: { ignored: true } } as unknown as RequestWithUser;
  for (const chain of placementIdValidation) {
    await chain.run(req);
  }
  return new Promise<Response>((resolve) => {
    const res = {} as Response;
    const done = () => {
      resolve(res);
      return res;
    };
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(done);
    res.send = vi.fn().mockImplementation(done);
    deletePlacement(req, res, vi.fn());
  });
};

describe('deletePlacement', () => {
  const ID = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    findByIdAndDeleteMock.mockReset();
  });

  it('responds 400 without touching the DB when the id is invalid', async () => {
    const res = await runDelete('abc');

    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid input data',
      errors: [
        {
          type: 'field',
          value: 'abc',
          msg: 'id must be a valid MongoDB ObjectId',
          path: 'id',
          location: 'params'
        }
      ]
    });
  });

  it('responds 404 when no placement has that id', async () => {
    findByIdAndDeleteMock.mockResolvedValue(null as never);

    const res = await runDelete(ID);

    expect(findByIdAndDeleteMock).toHaveBeenCalledWith(ID);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'No placement found with that ID'
    });
  });

  it('responds 204 with no body when the placement is deleted', async () => {
    findByIdAndDeleteMock.mockResolvedValue({ _id: ID } as never);

    const res = await runDelete(ID);

    expect(findByIdAndDeleteMock).toHaveBeenCalledWith(ID);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responds 500 on DB errors', async () => {
    findByIdAndDeleteMock.mockRejectedValue(new Error('connection lost'));

    const res = await runDelete(ID);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });
});

/**
 * Runs the update validation, then updatePlacement, and resolves once it responds.
 */
const runUpdate = async (id: string, body: unknown) => {
  const req = { params: { id }, body } as unknown as RequestWithUser;
  for (const chain of updatePlacementValidation) {
    await chain.run(req);
  }
  return new Promise<Response>((resolve) => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(() => {
      resolve(res);
      return res;
    });
    updatePlacement(req, res, vi.fn());
  });
};

describe('updatePlacement', () => {
  const ID = '507f1f77bcf86cd799439011';

  const minimalBody = () => ({
    status: 'active',
    siteOperator: 'Cellnex',
    location: {},
    source: 'Ministry'
  });

  // Stand-in for a loaded Mongoose document
  const fakeDoc = () => ({
    _id: ID,
    transmitters: [transmitter()],
    set: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined)
  });

  let doc: ReturnType<typeof fakeDoc>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    doc = fakeDoc();
    findByIdMock.mockReset();
    findByIdMock.mockResolvedValue(doc as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('responds 400 without touching the DB when validation fails', async () => {
    const res = await runUpdate('abc', { ...minimalBody(), transmitters: [] });

    expect(findByIdMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'Invalid input data',
        errors: expect.arrayContaining([
          expect.objectContaining({ path: 'id', location: 'params' }),
          expect.objectContaining({ path: 'transmitters', location: 'body' })
        ])
      })
    );
  });

  it('responds 404 when no placement has that id', async () => {
    findByIdMock.mockResolvedValue(null as never);

    const res = await runUpdate(ID, minimalBody());

    expect(findByIdMock).toHaveBeenCalledWith(ID);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'No placement found with that ID'
    });
  });

  it('sets every placement field, fills nullables and stamps lastUpdate', async () => {
    await runUpdate(ID, { ...minimalBody(), lastUpdate: '2020-01-01T00:00:00.000Z' });

    expect(doc.set).toHaveBeenCalledWith({
      status: 'active',
      siteOperator: 'Cellnex',
      location: { lat: null, lon: null, altM: null },
      postcode: null,
      source: 'Ministry',
      lastUpdate: NOW
    });
    expect(doc.save).toHaveBeenCalled();
  });

  it('responds 200 with the saved placement', async () => {
    const res = await runUpdate(ID, {
      ...minimalBody(),
      location: { lat: 40.4168, lon: -3.7038, altM: 657 },
      postcode: '28001'
    });

    expect(doc.set).toHaveBeenCalledWith(
      expect.objectContaining({
        location: { lat: 40.4168, lon: -3.7038, altM: 657 },
        postcode: '28001'
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: { placement: doc } });
  });

  it('responds 400 when Mongoose rejects the document', async () => {
    const validationError = new mongoose.Error.ValidationError();
    validationError.addError(
      'location.lat',
      new mongoose.Error.ValidatorError({
        message: 'lat and lon must both be set or both be null',
        path: 'location.lat'
      })
    );
    doc.save.mockRejectedValue(validationError);

    const res = await runUpdate(ID, minimalBody());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid input data',
      errors: [
        {
          type: 'field',
          msg: 'lat and lon must both be set or both be null',
          path: 'location.lat',
          location: 'body'
        }
      ]
    });
  });

  it('responds 404 when the placement is deleted before saving', async () => {
    doc.save.mockRejectedValue(new mongoose.Error.DocumentNotFoundError('{}', 'Placement'));

    const res = await runUpdate(ID, minimalBody());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'No placement found with that ID'
    });
  });

  it('responds 500 on other errors', async () => {
    doc.save.mockRejectedValue(new Error('connection lost'));

    const res = await runUpdate(ID, minimalBody());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });
});

/**
 * Runs the id validation, then deleteTransmitter, and resolves once it responds
 * (res.json for errors, res.send for the 204).
 */
const runDeleteTransmitter = async (placementId: string, transmitterId: string) => {
  const req = {
    params: { placementId, transmitterId },
    body: { ignored: true },
    query: { ignored: 'yes' }
  } as unknown as RequestWithUser;
  for (const chain of transmitterIdValidation) {
    await chain.run(req);
  }
  return new Promise<Response>((resolve) => {
    const res = {} as Response;
    const done = () => {
      resolve(res);
      return res;
    };
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(done);
    res.send = vi.fn().mockImplementation(done);
    deleteTransmitter(req, res, vi.fn());
  });
};

describe('deleteTransmitter', () => {
  const PLACEMENT_ID = '507f1f77bcf86cd799439011';
  const TRANSMITTER_ID = '507f1f77bcf86cd799439012';

  // Stand-in for a loaded Mongoose document holding its only transmitter
  const fakeDoc = () => {
    const subdoc = { ...transmitter(), _id: TRANSMITTER_ID, deleteOne: vi.fn() };
    return {
      _id: PLACEMENT_ID,
      lastUpdate: new Date('2026-01-01T00:00:00.000Z'),
      subdoc,
      transmitters: {
        id: vi.fn((id: string) => (id === TRANSMITTER_ID ? subdoc : null))
      },
      save: vi.fn().mockResolvedValue(undefined)
    };
  };

  let doc: ReturnType<typeof fakeDoc>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    doc = fakeDoc();
    findByIdMock.mockReset();
    findByIdMock.mockResolvedValue(doc as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('responds 400 with both errors without touching the DB when the ids are invalid', async () => {
    const res = await runDeleteTransmitter('abc', 'xyz');

    expect(findByIdMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid input data',
      errors: [
        {
          type: 'field',
          value: 'abc',
          msg: 'placementId must be a valid MongoDB ObjectId',
          path: 'placementId',
          location: 'params'
        },
        {
          type: 'field',
          value: 'xyz',
          msg: 'transmitterId must be a valid MongoDB ObjectId',
          path: 'transmitterId',
          location: 'params'
        }
      ]
    });
  });

  it('responds 404 when no placement has that id', async () => {
    findByIdMock.mockResolvedValue(null as never);

    const res = await runDeleteTransmitter(PLACEMENT_ID, TRANSMITTER_ID);

    expect(findByIdMock).toHaveBeenCalledWith(PLACEMENT_ID);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'No placement found with that ID'
    });
  });

  it('responds 404 without saving when the placement has no transmitter with that id', async () => {
    const otherId = '507f1f77bcf86cd799439099';

    const res = await runDeleteTransmitter(PLACEMENT_ID, otherId);

    expect(doc.transmitters.id).toHaveBeenCalledWith(otherId);
    expect(doc.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'No transmitter found with that ID'
    });
  });

  it('removes the last transmitter, stamps lastUpdate, saves and responds 204', async () => {
    const res = await runDeleteTransmitter(PLACEMENT_ID, TRANSMITTER_ID);

    expect(findByIdMock).toHaveBeenCalledWith(PLACEMENT_ID);
    expect(doc.transmitters.id).toHaveBeenCalledWith(TRANSMITTER_ID);
    expect(doc.subdoc.deleteOne).toHaveBeenCalledOnce();
    expect(doc.lastUpdate).toEqual(NOW);
    expect(doc.save).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responds 400 when Mongoose rejects the document on save', async () => {
    const validationError = new mongoose.Error.ValidationError();
    validationError.addError(
      'source',
      new mongoose.Error.ValidatorError({ message: 'A source must be provided', path: 'source' })
    );
    doc.save.mockRejectedValue(validationError);

    const res = await runDeleteTransmitter(PLACEMENT_ID, TRANSMITTER_ID);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'Invalid input data',
      errors: [
        { type: 'field', msg: 'A source must be provided', path: 'source', location: 'body' }
      ]
    });
  });

  it('responds 404 when the placement is deleted before saving', async () => {
    doc.save.mockRejectedValue(new mongoose.Error.DocumentNotFoundError('{}', 'Placement'));

    const res = await runDeleteTransmitter(PLACEMENT_ID, TRANSMITTER_ID);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      message: 'No placement found with that ID'
    });
  });

  it('responds 500 on DB errors', async () => {
    findByIdMock.mockRejectedValue(new Error('connection lost'));

    const res = await runDeleteTransmitter(PLACEMENT_ID, TRANSMITTER_ID);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });

  it('responds 500 on other save errors', async () => {
    doc.save.mockRejectedValue(new Error('connection lost'));

    const res = await runDeleteTransmitter(PLACEMENT_ID, TRANSMITTER_ID);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });
});

/**
 * Runs the GET validation, then getPlacements, and resolves once it responds.
 */
const runGet = async (query: Record<string, unknown>) => {
  const req = { query } as unknown as Request;
  for (const chain of getPlacementsValidation) {
    await chain.run(req);
  }
  return new Promise<Response>((resolve) => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(() => {
      resolve(res);
      return res;
    });
    getPlacements(req, res, vi.fn());
  });
};

describe('getPlacements', () => {
  const placement = { _id: '507f1f77bcf86cd799439011', status: 'active', transmitters: [] };

  // Chainable stand-in for the Mongoose query returned by find()
  const query = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn()
  };

  beforeEach(() => {
    vi.stubEnv('DEFAULT_PERPAGE', '20');
    vi.stubEnv('MAX_PERPAGE', '100');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.lean.mockResolvedValue([placement]);
    findMock.mockReset();
    findMock.mockReturnValue(query as never);
    countDocumentsMock.mockReset();
    countDocumentsMock.mockResolvedValue(41 as never);
  });

  it('responds 400 without querying the DB when the query is invalid', async () => {
    const res = await runGet({ foo: '1' });

    expect(findMock).not.toHaveBeenCalled();
    expect(countDocumentsMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'Invalid input data',
        errors: [expect.objectContaining({ msg: 'Unknown query parameter(s): foo' })]
      })
    );
  });

  it('lists the first page with defaults, sorted by _id', async () => {
    const res = await runGet({});

    expect(findMock).toHaveBeenCalledWith({}, {});
    expect(countDocumentsMock).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(query.lean).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      page: 1,
      perPage: 20,
      totalPages: 3,
      total: 41,
      results: [placement]
    });
  });

  it('caps perPage and echoes the capped value', async () => {
    const res = await runGet({ page: '2', perPage: '500' });

    expect(query.skip).toHaveBeenCalledWith(100);
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, perPage: 100, totalPages: 1 })
    );
  });

  it('builds the filter from the sanitized query', async () => {
    await runGet({
      id: '507f1f77bcf86cd799439011',
      status: 'active,unknown',
      siteOperator: ' cellnex ',
      postcode: '28001,28002',
      type: 'radio',
      technology: 'FM,DAB+',
      stationName: 'espana',
      broadcaster: 'rtve'
    });

    const filter = {
      _id: { $in: ['507f1f77bcf86cd799439011'] },
      status: { $in: ['active', 'unknown'] },
      siteOperator: accentInsensitiveRegex('cellnex'),
      postcode: { $in: ['28001', '28002'] },
      transmitters: {
        $elemMatch: {
          type: { $in: ['radio'] },
          technology: { $in: ['FM', 'DAB+'] },
          stationName: accentInsensitiveRegex('espana'),
          broadcaster: accentInsensitiveRegex('rtve')
        }
      }
    };
    expect(findMock).toHaveBeenCalledWith(filter, {});
    expect(countDocumentsMock).toHaveBeenCalledWith(filter);
  });

  it('leaves transmitters out with fields=summary', async () => {
    await runGet({ fields: 'summary', technology: 'TDT' });

    expect(findMock).toHaveBeenCalledWith(
      { transmitters: { $elemMatch: { technology: { $in: ['TDT'] } } } },
      { transmitters: 0 }
    );
  });

  it('responds 200 with empty results when nothing matches', async () => {
    query.lean.mockResolvedValue([]);
    countDocumentsMock.mockResolvedValue(0 as never);

    const res = await runGet({ id: '507f1f77bcf86cd799439011' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      page: 1,
      perPage: 20,
      totalPages: 0,
      total: 0,
      results: []
    });
  });

  it('responds 500 on DB errors', async () => {
    countDocumentsMock.mockRejectedValue(new Error('connection lost'));

    const res = await runGet({});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });
});

/**
 * Runs the GET /transmitter validation, then getTransmitters, and resolves once it responds.
 */
const runGetTransmitters = async (query: Record<string, unknown>) => {
  const req = { query } as unknown as Request;
  for (const chain of getTransmittersValidation) {
    await chain.run(req);
  }
  return new Promise<Response>((resolve) => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(() => {
      resolve(res);
      return res;
    });
    getTransmitters(req, res, vi.fn());
  });
};

describe('getTransmitters', () => {
  const PLACEMENT_ID = '507f1f77bcf86cd799439011';
  const item = {
    _id: '507f1f77bcf86cd799439012',
    placementId: PLACEMENT_ID,
    ...transmitter(),
    placement: {
      status: 'active',
      siteOperator: 'Cellnex',
      location: { lat: 40.4168, lon: -3.7038, altM: 657 },
      postcode: '28001'
    }
  };

  const projection = {
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

  let countResult: { total: number }[];

  // The count pipeline is the one ending in $count
  const pipelines = () => {
    const calls = aggregateMock.mock.calls.map(([pipeline]) => pipeline as object[]);
    const isCount = (pipeline: object[]) => '$count' in pipeline[pipeline.length - 1];
    return { results: calls.find((p) => !isCount(p))!, count: calls.find(isCount)! };
  };

  beforeEach(() => {
    vi.stubEnv('DEFAULT_PERPAGE', '20');
    vi.stubEnv('MAX_PERPAGE', '100');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    countResult = [{ total: 41 }];
    aggregateMock.mockReset();
    aggregateMock.mockImplementation(((pipeline: object[]) =>
      Promise.resolve('$count' in pipeline[pipeline.length - 1] ? countResult : [item])) as never);
  });

  it('responds 400 without querying the DB when the query is invalid', async () => {
    const res = await runGetTransmitters({ id: PLACEMENT_ID });

    expect(aggregateMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'Invalid input data',
        errors: [expect.objectContaining({ msg: 'Unknown query parameter(s): id' })]
      })
    );
  });

  it('lists the first page with defaults, sorting placements before $unwind', async () => {
    const res = await runGetTransmitters({});

    expect(aggregateMock).toHaveBeenCalledTimes(2);
    expect(pipelines()).toEqual({
      results: [
        { $match: {} },
        { $sort: { _id: 1 } },
        { $unwind: '$transmitters' },
        { $skip: 0 },
        { $limit: 20 },
        { $project: projection }
      ],
      count: [{ $match: {} }, { $unwind: '$transmitters' }, { $count: 'total' }]
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      page: 1,
      perPage: 20,
      totalPages: 3,
      total: 41,
      results: [item]
    });
  });

  it('caps perPage and echoes the capped value', async () => {
    const res = await runGetTransmitters({ page: '2', perPage: '500' });

    expect(pipelines().results).toEqual(expect.arrayContaining([{ $skip: 100 }, { $limit: 100 }]));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, perPage: 100, totalPages: 1 })
    );
  });

  it('matches placements before $unwind and transmitters again after it', async () => {
    await runGetTransmitters({
      placementId: PLACEMENT_ID,
      status: 'active',
      siteOperator: ' cellnex ',
      postcode: '28001',
      type: 'radio',
      technology: 'FM,DAB+',
      stationName: 'espana',
      broadcaster: 'rtve'
    });

    const placementMatch = {
      _id: { $in: [new mongoose.Types.ObjectId(PLACEMENT_ID)] },
      status: { $in: ['active'] },
      siteOperator: accentInsensitiveRegex('cellnex'),
      postcode: { $in: ['28001'] },
      transmitters: {
        $elemMatch: {
          type: { $in: ['radio'] },
          technology: { $in: ['FM', 'DAB+'] },
          stationName: accentInsensitiveRegex('espana'),
          broadcaster: accentInsensitiveRegex('rtve')
        }
      }
    };
    const transmitterMatch = {
      'transmitters.type': { $in: ['radio'] },
      'transmitters.technology': { $in: ['FM', 'DAB+'] },
      'transmitters.stationName': accentInsensitiveRegex('espana'),
      'transmitters.broadcaster': accentInsensitiveRegex('rtve')
    };
    expect(pipelines()).toEqual({
      results: [
        { $match: placementMatch },
        { $sort: { _id: 1 } },
        { $unwind: '$transmitters' },
        { $match: transmitterMatch },
        { $skip: 0 },
        { $limit: 20 },
        { $project: projection }
      ],
      count: [
        { $match: placementMatch },
        { $unwind: '$transmitters' },
        { $match: transmitterMatch },
        { $count: 'total' }
      ]
    });
  });

  it('casts placementId values to ObjectId', async () => {
    await runGetTransmitters({ placementId: PLACEMENT_ID });

    const match = (pipelines().results[0] as { $match: { _id: { $in: unknown[] } } }).$match;
    expect(match._id.$in[0]).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it('responds 200 with empty results and total 0 when nothing matches', async () => {
    countResult = [];
    aggregateMock.mockImplementation(((pipeline: object[]) =>
      Promise.resolve('$count' in pipeline[pipeline.length - 1] ? countResult : [])) as never);

    const res = await runGetTransmitters({ technology: 'AM-LW' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      page: 1,
      perPage: 20,
      totalPages: 0,
      total: 0,
      results: []
    });
  });

  it('responds 500 on DB errors', async () => {
    aggregateMock.mockRejectedValue(new Error('connection lost'));

    const res = await runGetTransmitters({});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });
});

describe('exportFilename', () => {
  it('names the file after the UTC time, without colons or milliseconds', () => {
    expect(exportFilename(new Date('2026-11-17T09:05:03.123Z'))).toBe(
      'spainantennas-export-2026-11-17T09-05-03Z.json'
    );
  });
});

/**
 * Writable stand-in for the Express response: collects the streamed body, and resolves
 * `done` once the handler finishes (json/send, end of stream or destroy).
 */
class FakeExportResponse extends Writable {
  body = '';
  status = vi.fn().mockReturnValue(this);
  attachment = vi.fn().mockReturnValue(this);
  json = vi.fn();
  send = vi.fn();
  done: Promise<void>;

  constructor() {
    super();
    this.done = new Promise((resolve) => {
      this.json.mockImplementation(() => {
        resolve();
        return this;
      });
      this.send.mockImplementation(() => {
        resolve();
        return this;
      });
      this.on('finish', () => resolve());
      this.on('close', () => resolve());
    });
  }

  override _write(chunk: Buffer, _encoding: string, callback: () => void) {
    this.body += chunk.toString();
    callback();
  }
}

/**
 * Cursor stand-in over `docs`. When `failAt` is set, the next() call with that index
 * rejects.
 */
const fakeCursor = (docs: object[], failAt?: number) => {
  let calls = 0;
  return {
    next: vi.fn(async () => {
      const call = calls++;
      if (call === failAt) {
        throw new Error('cursor failed');
      }
      return docs[call] ?? null;
    }),
    close: vi.fn().mockResolvedValue(undefined)
  };
};

describe('exportPlacements', () => {
  const docs = [1, 2].map((i) => ({
    _id: new mongoose.Types.ObjectId(`507f1f77bcf86cd79943901${i}`),
    status: 'active',
    siteOperator: 'Cellnex',
    location: { lat: 40.4168, lon: -3.7038, altM: 657 },
    postcode: '28001',
    transmitters: [
      { _id: new mongoose.Types.ObjectId(`507f1f77bcf86cd79943902${i}`), ...transmitter() }
    ],
    lastUpdate: NOW,
    source: 'Ministry station data\nsecond line'
  }));

  // Chainable stand-in for the Mongoose query returned by find()
  const query = { sort: vi.fn(), lean: vi.fn(), cursor: vi.fn() };
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const runExport = async (
    queryParams: Record<string, unknown>,
    cursor: ReturnType<typeof fakeCursor> = fakeCursor(docs)
  ) => {
    query.cursor.mockReturnValue(cursor);
    const req = { query: queryParams } as unknown as RequestWithUser;
    for (const chain of exportPlacementsValidation) {
      await chain.run(req);
    }
    const res = new FakeExportResponse();
    exportPlacements(req, res as unknown as Response, vi.fn());
    await res.done;
    return res;
  };

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.sort.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    findMock.mockReset();
    findMock.mockReturnValue(query as never);
  });

  it('streams every placement, pretty-printed like the data files, sorted by _id', async () => {
    const cursor = fakeCursor(docs);
    const res = await runExport({}, cursor);

    expect(findMock).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.attachment).toHaveBeenCalledWith(
      expect.stringMatching(/^spainantennas-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/)
    );
    expect(res.body).toBe(JSON.stringify(docs, null, 2));
    expect(JSON.parse(res.body)[0]).toMatchObject({
      _id: '507f1f77bcf86cd799439011',
      transmitters: [{ _id: '507f1f77bcf86cd799439021' }],
      lastUpdate: NOW.toISOString()
    });
    expect(cursor.close).toHaveBeenCalled();
  });

  it('writes compact JSON with compact=true', async () => {
    const res = await runExport({ compact: 'true' });

    expect(res.body).toBe(JSON.stringify(docs));
  });

  it('pretty-prints with compact=false', async () => {
    const res = await runExport({ compact: 'false' });

    expect(res.body).toBe(JSON.stringify(docs, null, 2));
  });

  it('pretty-prints a single placement', async () => {
    const res = await runExport({}, fakeCursor(docs.slice(0, 1)));

    expect(res.body).toBe(JSON.stringify(docs.slice(0, 1), null, 2));
  });

  it('builds the filter from status, postcode and one transmitter $elemMatch', async () => {
    await runExport({
      status: 'active,inactive',
      postcode: '28001',
      type: 'radio',
      technology: 'FM,DAB+',
      compact: 'true'
    });

    expect(findMock).toHaveBeenCalledWith({
      status: { $in: ['active', 'inactive'] },
      postcode: { $in: ['28001'] },
      transmitters: {
        $elemMatch: { type: { $in: ['radio'] }, technology: { $in: ['FM', 'DAB+'] } }
      }
    });
  });

  it('sends an empty array attachment when nothing matches', async () => {
    const cursor = fakeCursor([]);
    const res = await runExport({ status: 'inactive' }, cursor);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.attachment).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('[]');
    expect(cursor.close).toHaveBeenCalled();
  });

  it('responds 400 without querying the DB when the query is invalid', async () => {
    const res = await runExport({ page: '1' });

    expect(findMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fail', message: 'Invalid input data' })
    );
  });

  it('responds 500 JSON when the DB fails before the first placement', async () => {
    const cursor = fakeCursor(docs, 0);
    const res = await runExport({}, cursor);

    expect(res.attachment).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
    expect(cursor.close).toHaveBeenCalled();
  });

  it('destroys the response when the DB fails mid-export', async () => {
    const cursor = fakeCursor(docs, 1);
    const res = await runExport({}, cursor);
    // The response closes before the handler's catch block logs
    await vi.waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith('Export stream failed:', expect.any(Error))
    );

    expect(res.destroyed).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
    expect(res.body.endsWith(']')).toBe(false);
    expect(cursor.close).toHaveBeenCalled();
  });
});

/**
 * Runs the GET /stats validation, then getStats, and resolves once it responds.
 */
const runStats = async (query: Record<string, unknown>) => {
  const req = { query } as unknown as Request;
  for (const chain of getStatsValidation) {
    await chain.run(req);
  }
  return new Promise<Response>((resolve) => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation(() => {
      resolve(res);
      return res;
    });
    getStats(req, res, vi.fn());
  });
};

describe('getStats', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    countDocumentsMock.mockReset();
    countDocumentsMock.mockResolvedValue(23 as never);
  });

  it('counts every placement when there is no filter', async () => {
    const res = await runStats({});

    expect(countDocumentsMock).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', totalCount: 23 });
  });

  it('filters by placement status', async () => {
    await runStats({ status: 'active,unknown' });

    expect(countDocumentsMock).toHaveBeenCalledWith({ status: { $in: ['active', 'unknown'] } });
  });

  it('combines transmitter filters in a single $elemMatch', async () => {
    await runStats({ status: 'active', type: 'radio', technology: 'FM, DAB+' });

    expect(countDocumentsMock).toHaveBeenCalledWith({
      status: { $in: ['active'] },
      transmitters: {
        $elemMatch: { type: { $in: ['radio'] }, technology: { $in: ['FM', 'DAB+'] } }
      }
    });
  });

  it('responds 200 with totalCount 0 when nothing matches', async () => {
    countDocumentsMock.mockResolvedValue(0 as never);

    const res = await runStats({ technology: 'AM-LW' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', totalCount: 0 });
  });

  it.each([
    [{ page: '1' }, 'Unknown query parameter(s): page'],
    [{ postcode: '28001' }, 'Unknown query parameter(s): postcode'],
    [{ technology: 'DAB' }, 'technology must be one of: AM-LW, AM-MW, FM, TDT, DAB+'],
    [{ status: '' }, 'status cannot be empty'],
    [{ type: ['TV', 'radio'] }, 'type must be given only once']
  ])('responds 400 without querying the DB for %o', async (query, msg) => {
    const res = await runStats(query);

    expect(countDocumentsMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'Invalid input data',
        errors: [expect.objectContaining({ msg })]
      })
    );
  });

  it('responds 500 on DB errors', async () => {
    countDocumentsMock.mockRejectedValue(new Error('connection lost'));

    const res = await runStats({});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Internal server error' });
  });
});
