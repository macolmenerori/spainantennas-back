import { Response } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';

import PlacementModel from '../models/spainantennasModel';
import { Location, Placement, Transmitter } from '../models/spainantennasTypes';
import { RequestWithUser } from '../models/userTypes';
import catchAsync from '../utils/catchAsync';

// Body shapes once express-validator has passed: nullable keys may be omitted
type TransmitterBody = Omit<Transmitter, 'frequencykHz' | 'powerKw'> &
  Partial<Pick<Transmitter, 'frequencykHz' | 'powerKw'>>;

type PlacementBody = Pick<Placement, 'status' | 'siteOperator' | 'source'> & {
  location: Partial<Location>;
  postcode?: string | null;
  transmitters?: TransmitterBody[];
};

const buildTransmitter = (transmitter: TransmitterBody): Transmitter => ({
  type: transmitter.type,
  technology: transmitter.technology,
  frequencykHz: transmitter.frequencykHz ?? null,
  stationName: transmitter.stationName,
  broadcaster: transmitter.broadcaster,
  powerKw: transmitter.powerKw ?? null,
  source: transmitter.source
});

/**
 * Sends the 400 response when express-validator found errors.
 *
 * @returns The sent response when validation failed, `undefined` otherwise
 */
const checkValidation = (req: RequestWithUser, res: Response) => {
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
    status: body.status,
    siteOperator: body.siteOperator,
    location: {
      lat: body.location.lat ?? null,
      lon: body.location.lon ?? null,
      altM: body.location.altM ?? null
    },
    postcode: body.postcode ?? null,
    transmitters: (body.transmitters ?? []).map(buildTransmitter),
    lastUpdate: new Date(),
    source: body.source
  };

  try {
    const newPlacement = await PlacementModel.create(placement);
    return res.status(201).json({
      status: 'success',
      data: { placement: newPlacement }
    });
  } catch (err) {
    // Last guard: the schema rejected what express-validator let through
    if (err instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid input data',
        errors: Object.values(err.errors).map((error) => ({
          type: 'field',
          msg: error.message,
          path: error.path,
          location: 'body'
        }))
      });
    }
    throw err;
  }
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
    return res.status(404).json({
      status: 'fail',
      message: 'No placement found with that ID'
    });
  }

  return res.status(204).send();
});
