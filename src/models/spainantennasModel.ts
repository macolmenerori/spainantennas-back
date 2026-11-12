import mongoose, { Schema } from 'mongoose';

import {
  Location,
  PLACEMENT_STATUSES,
  PlacementType,
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
      trim: true
    },
    broadcaster: {
      type: String,
      required: [true, 'A broadcaster must be provided'],
      trim: true
    },
    powerKw: {
      type: Number,
      default: null,
      min: [0, 'powerKw must be 0 or greater']
    },
    source: {
      type: String,
      required: [true, 'A transmitter source must be provided'],
      trim: true
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
      trim: true
    },
    location: {
      type: locationSchema,
      required: [true, 'A location must be provided']
    },
    postcode: {
      type: String,
      default: null,
      trim: true,
      match: [/^\d{5}$/, 'postcode must be 5 digits']
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
      trim: true
    }
  },
  { versionKey: false, strict: 'throw' }
);

placementSchema.index({ status: 1 });
placementSchema.index({ postcode: 1 });
placementSchema.index({ 'transmitters.technology': 1, 'transmitters.type': 1 });

const PlacementModel = mongoose.model<PlacementType>('Placement', placementSchema);

export default PlacementModel;
