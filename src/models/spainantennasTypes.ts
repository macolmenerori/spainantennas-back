import { HydratedDocument, Types } from 'mongoose';

export const PLACEMENT_STATUSES = ['active', 'inactive', 'unknown'] as const;
export const TRANSMITTER_TYPES = ['TV', 'radio'] as const;
export const TRANSMITTER_TECHNOLOGIES = ['AM-LW', 'AM-MW', 'FM', 'TDT', 'DAB+'] as const;

// Bounding box of Spain (Canarias to Menorca), inclusive
export const SPAIN_BOUNDS = {
  latMin: 27,
  latMax: 44,
  lonMin: -19,
  lonMax: 5
} as const;

// Max length of name-like strings: siteOperator, stationName, broadcaster
export const MAX_NAME_LENGTH = 200;
// Max length of the free-text source fields (placement and transmitter)
export const MAX_SOURCE_LENGTH = 5000;

// Spanish postcode: exactly 5 digits
export const POSTCODE_REGEX = /^\d{5}$/;

export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];
export type TransmitterType = (typeof TRANSMITTER_TYPES)[number];
export type TransmitterTechnology = (typeof TRANSMITTER_TECHNOLOGIES)[number];

export type Location = {
  lat: number | null;
  lon: number | null;
  altM: number | null;
};

export type Transmitter = {
  type: TransmitterType;
  technology: TransmitterTechnology;
  frequencykHz: number | null;
  stationName: string;
  broadcaster: string;
  powerKw: number | null;
  source: string;
};

export type Placement = {
  status: PlacementStatus;
  siteOperator: string;
  location: Location;
  postcode: string | null;
  transmitters: Transmitter[];
  lastUpdate: Date;
  source: string;
};

export type PlacementType = HydratedDocument<
  Placement,
  { transmitters: Types.DocumentArray<Transmitter> }
>;
