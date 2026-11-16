import { Request } from 'express';
import { FieldValidationError, validationResult } from 'express-validator';
import { describe, expect, it } from 'vitest';

import { MAX_NAME_LENGTH, MAX_SOURCE_LENGTH } from '../models/spainantennasTypes';

import {
  createPlacementValidation,
  placementIdValidation,
  updatePlacementValidation
} from './spainantennas.validations';

const transmitter = () => ({
  type: 'radio',
  technology: 'FM',
  frequencykHz: 88200,
  stationName: 'Radio Nacional',
  broadcaster: 'RTVE',
  powerKw: 10,
  source: 'Ministry FM list'
});

const fullBody = () => ({
  status: 'active',
  siteOperator: 'Cellnex',
  location: { lat: 40.4168, lon: -3.7038, altM: 657 },
  postcode: '28001',
  transmitters: [transmitter()],
  source: 'Ministry station data'
});

const minimalBody = () => ({
  status: 'unknown',
  siteOperator: 'unknown',
  location: {},
  source: 'manual'
});

/**
 * Runs every chain against a fake request and returns the errors plus the (sanitized) body.
 */
const validate = async (body: unknown) => {
  const req = { body } as Request;
  for (const chain of createPlacementValidation) {
    await chain.run(req);
  }
  const errors = validationResult(req).array() as FieldValidationError[];
  return { errors, body: req.body };
};

const expectError = async (body: unknown, path: string, msg?: string | RegExp) => {
  const { errors } = await validate(body);
  const error = errors.find((e) => e.path === path);
  expect(error, `expected an error on "${path}", got ${JSON.stringify(errors)}`).toBeDefined();
  if (msg) {
    expect(error!.msg).toMatch(msg);
  }
};

describe('createPlacementValidation', () => {
  describe('valid bodies', () => {
    it('accepts a full body', async () => {
      expect((await validate(fullBody())).errors).toEqual([]);
    });

    it('accepts a minimal body (empty location, no transmitters)', async () => {
      expect((await validate(minimalBody())).errors).toEqual([]);
    });

    it('accepts explicit nulls on nullable fields', async () => {
      const body = {
        ...fullBody(),
        location: { lat: null, lon: null, altM: null },
        postcode: null,
        transmitters: [{ ...transmitter(), frequencykHz: null, powerKw: null }]
      };
      expect((await validate(body)).errors).toEqual([]);
    });

    it('accepts an empty transmitters array', async () => {
      expect((await validate({ ...minimalBody(), transmitters: [] })).errors).toEqual([]);
    });

    it('accepts lastUpdate (ignored by the controller)', async () => {
      const body = { ...minimalBody(), lastUpdate: '2026-01-01T00:00:00.000Z' };
      expect((await validate(body)).errors).toEqual([]);
    });

    it('accepts negative altM and coordinates on the Spain box edges', async () => {
      const body = { ...minimalBody(), location: { lat: 27, lon: 5, altM: -1 } };
      expect((await validate(body)).errors).toEqual([]);
    });

    it('trims strings', async () => {
      const body = {
        ...fullBody(),
        siteOperator: '  Cellnex  ',
        postcode: ' 28001 ',
        transmitters: [{ ...transmitter(), stationName: ' RNE ' }]
      };
      const result = await validate(body);
      expect(result.errors).toEqual([]);
      expect(result.body.siteOperator).toBe('Cellnex');
      expect(result.body.postcode).toBe('28001');
      expect(result.body.transmitters[0].stationName).toBe('RNE');
    });
  });

  describe('body shape', () => {
    it.each([
      ['undefined', undefined],
      ['an array', [fullBody()]],
      ['a string', 'placement']
    ])('rejects a body that is %s', async (_name, body) => {
      await expectError(body, '', 'Body must be a JSON object');
    });

    it.each(['foo', '_id', '$where'])('rejects unknown root key %s', async (key) => {
      await expectError({ ...fullBody(), [key]: 'x' }, '', `Unknown field(s): ${key}`);
    });
  });

  describe('required strings', () => {
    it.each(['siteOperator', 'source'])(
      'rejects missing, null, non-string and blank %s',
      async (field) => {
        await expectError({ ...fullBody(), [field]: undefined }, field, 'is required');
        await expectError({ ...fullBody(), [field]: null }, field, 'is required');
        await expectError({ ...fullBody(), [field]: 5 }, field, 'must be a string');
        await expectError({ ...fullBody(), [field]: '   ' }, field, 'cannot be empty');
      }
    );

    it('enforces max lengths', async () => {
      await expectError(
        { ...fullBody(), siteOperator: 'a'.repeat(MAX_NAME_LENGTH + 1) },
        'siteOperator',
        `at most ${MAX_NAME_LENGTH}`
      );
      await expectError(
        { ...fullBody(), source: 'a'.repeat(MAX_SOURCE_LENGTH + 1) },
        'source',
        `at most ${MAX_SOURCE_LENGTH}`
      );
      const atLimit = {
        ...fullBody(),
        siteOperator: 'a'.repeat(MAX_NAME_LENGTH),
        source: 'a'.repeat(MAX_SOURCE_LENGTH)
      };
      expect((await validate(atLimit)).errors).toEqual([]);
    });
  });

  describe('status', () => {
    it.each([
      ['missing', undefined, 'is required'],
      ['not a string', 1, 'must be a string'],
      ['not in the enum', 'Active', 'must be one of: active, inactive, unknown']
    ])('rejects status %s', async (_name, status, msg) => {
      await expectError({ ...fullBody(), status }, 'status', msg);
    });
  });

  describe('location', () => {
    it.each([
      ['missing', undefined, 'location is required'],
      ['null', null, 'location is required'],
      ['an array', [40, -3], 'location must be an object'],
      ['a string', '40,-3', 'location must be an object']
    ])('rejects location %s', async (_name, location, msg) => {
      await expectError({ ...fullBody(), location }, 'location', msg);
    });

    it('rejects unknown location keys', async () => {
      const body = { ...fullBody(), location: { lat: 40, lon: -3, extra: 1 } };
      await expectError(body, 'location', 'Unknown field(s): extra');
    });

    it.each([
      ['lat only', { lat: 40 }],
      ['lon only', { lon: -3 }],
      ['lat with null lon', { lat: 40, lon: null }]
    ])('rejects a half pair (%s)', async (_name, location) => {
      await expectError({ ...fullBody(), location }, 'location', 'both be set or both be null');
    });

    it.each([
      ['location.lat', { lat: 26.9, lon: -3 }, 'lat must be between 27 and 44'],
      ['location.lat', { lat: 44.1, lon: -3 }, 'lat must be between 27 and 44'],
      ['location.lon', { lat: 40, lon: -19.1 }, 'lon must be between -19 and 5'],
      ['location.lon', { lat: 40, lon: 5.1 }, 'lon must be between -19 and 5']
    ])('rejects %s out of the Spain box (%j)', async (path, location, msg) => {
      await expectError({ ...fullBody(), location }, path, msg);
    });

    it.each(['lat', 'lon', 'altM'])('rejects %s sent as a numeric string', async (key) => {
      const location = { lat: 40, lon: -3, altM: 100, [key]: '40' };
      await expectError({ ...fullBody(), location }, `location.${key}`, 'must be a number');
    });
  });

  describe('postcode', () => {
    it.each([
      ['a number', 28001, 'must be a string'],
      ['4 digits', '2800', 'must be 5 digits'],
      ['6 digits', '280011', 'must be 5 digits'],
      ['empty', '', 'must be 5 digits'],
      ['letters', '28a01', 'must be 5 digits']
    ])('rejects postcode %s', async (_name, postcode, msg) => {
      await expectError({ ...fullBody(), postcode }, 'postcode', msg);
    });
  });

  describe('transmitters', () => {
    it.each([
      ['null', null],
      ['an object', { 0: transmitter() }],
      ['a string', 'FM']
    ])('rejects transmitters that is %s', async (_name, transmitters) => {
      await expectError({ ...fullBody(), transmitters }, 'transmitters', 'must be an array');
    });

    it('rejects an item that is not an object', async () => {
      await expectError(
        { ...fullBody(), transmitters: [5] },
        'transmitters[0]',
        'Each transmitter must be an object'
      );
    });

    it.each(['color', '_id'])('rejects unknown transmitter key %s', async (key) => {
      const body = { ...fullBody(), transmitters: [{ ...transmitter(), [key]: 'x' }] };
      await expectError(body, 'transmitters[0]', `Unknown field(s): ${key}`);
    });

    it('reports errors with the item index', async () => {
      const body = {
        ...fullBody(),
        transmitters: [transmitter(), { ...transmitter(), type: 'tv' }]
      };
      await expectError(body, 'transmitters[1].type', 'must be one of: TV, radio');
    });

    it.each([
      ['type', undefined, 'type is required'],
      ['type', 'tv', 'must be one of: TV, radio'],
      ['technology', 'DAB', 'must be one of: AM-LW, AM-MW, FM, TDT, DAB+'],
      ['technology', 1, 'must be a string'],
      ['stationName', '', 'cannot be empty'],
      ['stationName', 'a'.repeat(MAX_NAME_LENGTH + 1), `at most ${MAX_NAME_LENGTH}`],
      ['broadcaster', null, 'broadcaster is required'],
      ['broadcaster', 'a'.repeat(MAX_NAME_LENGTH + 1), `at most ${MAX_NAME_LENGTH}`],
      ['source', undefined, 'source is required'],
      ['source', 'a'.repeat(MAX_SOURCE_LENGTH + 1), `at most ${MAX_SOURCE_LENGTH}`],
      ['frequencykHz', 0, 'frequencykHz must be greater than 0'],
      ['frequencykHz', -100, 'frequencykHz must be greater than 0'],
      ['frequencykHz', '88200', 'must be a number'],
      ['powerKw', -1, 'powerKw must be 0 or greater'],
      ['powerKw', '10', 'must be a number']
    ])('rejects %s = %j', async (field, value, msg) => {
      const body = { ...fullBody(), transmitters: [{ ...transmitter(), [field]: value }] };
      await expectError(body, `transmitters[0].${field}`, msg);
    });

    it('accepts powerKw 0', async () => {
      const body = { ...fullBody(), transmitters: [{ ...transmitter(), powerKw: 0 }] };
      expect((await validate(body)).errors).toEqual([]);
    });
  });
});

describe('placementIdValidation', () => {
  const validateId = async (id: string) => {
    const req = { params: { id } } as unknown as Request;
    for (const chain of placementIdValidation) {
      await chain.run(req);
    }
    return validationResult(req).array() as FieldValidationError[];
  };

  it('accepts a valid ObjectId', async () => {
    expect(await validateId('507f1f77bcf86cd799439011')).toEqual([]);
  });

  it.each(['abc', '507f1f77bcf86cd79943901z', ''])('rejects %j', async (id) => {
    const errors = await validateId(id);
    expect(errors).toEqual([
      expect.objectContaining({
        path: 'id',
        location: 'params',
        msg: 'id must be a valid MongoDB ObjectId'
      })
    ]);
  });
});

describe('updatePlacementValidation', () => {
  const ID = '507f1f77bcf86cd799439011';
  const TRANSMITTERS_MSG = 'transmitters cannot be changed here; use the transmitter endpoints';

  const updateBody = () => {
    const body: Partial<ReturnType<typeof fullBody>> = fullBody();
    delete body.transmitters;
    return body;
  };

  const validateUpdate = async (body: unknown, id = ID) => {
    const req = { params: { id }, body } as unknown as Request;
    for (const chain of updatePlacementValidation) {
      await chain.run(req);
    }
    return validationResult(req).array() as FieldValidationError[];
  };

  it('accepts a full body without transmitters', async () => {
    expect(await validateUpdate(updateBody())).toEqual([]);
  });

  it('accepts a minimal body', async () => {
    expect(await validateUpdate(minimalBody())).toEqual([]);
  });

  it('accepts lastUpdate (ignored by the controller)', async () => {
    const body = { ...minimalBody(), lastUpdate: '2026-01-01T00:00:00.000Z' };
    expect(await validateUpdate(body)).toEqual([]);
  });

  it.each([
    ['an empty array', []],
    ['null', null],
    ['a populated array', [transmitter()]]
  ])('rejects transmitters as %s with one dedicated error', async (_name, transmitters) => {
    const errors = await validateUpdate({ ...minimalBody(), transmitters });
    expect(errors).toEqual([
      expect.objectContaining({ path: 'transmitters', location: 'body', msg: TRANSMITTERS_MSG })
    ]);
  });

  it.each(['foo', '_id'])('rejects unknown root key %s', async (key) => {
    const errors = await validateUpdate({ ...minimalBody(), [key]: 'x' });
    expect(errors).toEqual([
      expect.objectContaining({ path: '', msg: `Unknown field(s): ${key}` })
    ]);
  });

  it('applies the shared field rules', async () => {
    const errors = await validateUpdate({
      ...updateBody(),
      status: 'broken',
      location: { lat: 40.4 },
      postcode: '123'
    });
    expect(errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(['status', 'location', 'postcode'])
    );
  });

  it('reports id and body errors together', async () => {
    const errors = await validateUpdate({ ...minimalBody(), status: 'broken' }, 'abc');
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'id', location: 'params' }),
        expect.objectContaining({ path: 'status', location: 'body' })
      ])
    );
  });
});
