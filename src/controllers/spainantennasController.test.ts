import { Response } from 'express';
import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PlacementModel from '../models/spainantennasModel';
import { RequestWithUser } from '../models/userTypes';
import {
  createPlacementValidation,
  placementIdValidation,
  updatePlacementValidation
} from '../validations/spainantennas.validations';

import { createPlacement, deletePlacement, updatePlacement } from './spainantennasController';

vi.mock('../models/spainantennasModel', () => ({
  default: { create: vi.fn(), findById: vi.fn(), findByIdAndDelete: vi.fn() }
}));

const createMock = vi.mocked(PlacementModel.create);
const findByIdMock = vi.mocked(PlacementModel.findById);
const findByIdAndDeleteMock = vi.mocked(PlacementModel.findByIdAndDelete);

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
