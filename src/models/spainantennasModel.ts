import mongoose, { Schema } from 'mongoose';

import {
  Location,
  MAX_NAME_LENGTH,
  MAX_SOURCE_LENGTH,
  PLACEMENT_STATUSES,
  PlacementType,
  POSTCODE_REGEX,
  SPAIN_BOUNDS,
  TRANSMITTER_TECHNOLOGIES,
  TRANSMITTER_TYPES
} from './spainantennasTypes';

// lat and lon must both be set or both be null (site not placed on the map yet)
const coordinatePairValidator = {
  validator: function (this: Location) {
    return (this.lat == null) === (this.lon == null);
  },
  message: 'lat and lon must both be set or both be null'
};

const locationSchema: Schema = new mongoose.Schema(
  {
    lat: {
      type: Number,
      default: null,
      min: [
        SPAIN_BOUNDS.latMin,
        `lat must be between ${SPAIN_BOUNDS.latMin} and ${SPAIN_BOUNDS.latMax}`
      ],
      max: [
        SPAIN_BOUNDS.latMax,
        `lat must be between ${SPAIN_BOUNDS.latMin} and ${SPAIN_BOUNDS.latMax}`
      ],
      validate: coordinatePairValidator
    },
    lon: {
      type: Number,
      default: null,
      min: [
        SPAIN_BOUNDS.lonMin,
        `lon must be between ${SPAIN_BOUNDS.lonMin} and ${SPAIN_BOUNDS.lonMax}`
      ],
      max: [
        SPAIN_BOUNDS.lonMax,
        `lon must be between ${SPAIN_BOUNDS.lonMin} and ${SPAIN_BOUNDS.lonMax}`
      ],
      validate: coordinatePairValidator
    },
    altM: {
      type: Number,
      default: null
    }
  },
  { _id: false, versionKey: false, strict: 'throw' }
);

const transmitterSchema: Schema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'A transmitter type must be provided'],
      enum: {
        values: TRANSMITTER_TYPES,
        message: `type must be one of: ${TRANSMITTER_TYPES.join(', ')}`
      }
    },
    technology: {
      type: String,
      required: [true, 'A technology must be provided'],
      enum: {
        values: TRANSMITTER_TECHNOLOGIES,
        message: `technology must be one of: ${TRANSMITTER_TECHNOLOGIES.join(', ')}`
      }
    },
    frequencykHz: {
      type: Number,
      default: null,
      validate: {
        validator: (val: number | null) => val == null || val > 0,
        message: 'frequencykHz must be greater than 0'
      }
    },
    stationName: {
      type: String,
      required: [true, 'A station name must be provided'],
      trim: true,
      maxlength: [MAX_NAME_LENGTH, `stationName must be at most ${MAX_NAME_LENGTH} characters`]
    },
    broadcaster: {
      type: String,
      required: [true, 'A broadcaster must be provided'],
      trim: true,
      maxlength: [MAX_NAME_LENGTH, `broadcaster must be at most ${MAX_NAME_LENGTH} characters`]
    },
    powerKw: {
      type: Number,
      default: null,
      min: [0, 'powerKw must be 0 or greater']
    },
    source: {
      type: String,
      required: [true, 'A transmitter source must be provided'],
      trim: true,
      maxlength: [MAX_SOURCE_LENGTH, `source must be at most ${MAX_SOURCE_LENGTH} characters`]
    }
  },
  { versionKey: false, strict: 'throw' }
);

const placementSchema: Schema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: [true, 'A status must be provided'],
      enum: {
        values: PLACEMENT_STATUSES,
        message: `status must be one of: ${PLACEMENT_STATUSES.join(', ')}`
      }
    },
    siteOperator: {
      type: String,
      required: [true, 'A site operator must be provided (use "unknown" if not known)'],
      trim: true,
      maxlength: [MAX_NAME_LENGTH, `siteOperator must be at most ${MAX_NAME_LENGTH} characters`]
    },
    location: {
      type: locationSchema,
      required: [true, 'A location must be provided']
    },
    postcode: {
      type: String,
      default: null,
      trim: true,
      match: [POSTCODE_REGEX, 'postcode must be 5 digits']
    },
    transmitters: {
      type: [transmitterSchema],
      default: []
    },
    lastUpdate: {
      type: Date,
      required: [true, 'A last update date must be provided'],
      default: Date.now
    },
    source: {
      type: String,
      required: [true, 'A source must be provided'],
      trim: true,
      maxlength: [MAX_SOURCE_LENGTH, `source must be at most ${MAX_SOURCE_LENGTH} characters`]
    }
  },
  { versionKey: false, strict: 'throw' }
);

placementSchema.index({ status: 1 });
placementSchema.index({ postcode: 1 });
placementSchema.index({ 'transmitters.technology': 1, 'transmitters.type': 1 });

const PlacementModel = mongoose.model<PlacementType>('Placement', placementSchema);

export default PlacementModel;
