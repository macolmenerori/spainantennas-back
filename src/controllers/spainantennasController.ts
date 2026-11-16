import { Request, Response } from 'express';
import { matchedData, validationResult } from 'express-validator';
import mongoose from 'mongoose';

import PlacementModel from '../models/spainantennasModel';
import { Location, Placement, Transmitter } from '../models/spainantennasTypes';
import { RequestWithUser } from '../models/userTypes';
import catchAsync from '../utils/catchAsync';
import { buildPlacementFilter, PlacementFilterQuery } from '../utils/filters';
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
 * Sends the 400 response when express-validator found errors.
 *
 * @returns The sent response when validation failed, `undefined` otherwise
 */
const checkValidation = (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid input data',
      errors: errors.array()
    });
  }
};

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
