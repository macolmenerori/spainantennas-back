import express from 'express';

import { protect } from '../controllers/authController';
import {
  createPlacement,
  deletePlacement,
  getPlacements,
  getTransmitters,
  importPlacements,
  updatePlacement
} from '../controllers/spainantennasController';
import { rejectInvalidRequest } from '../utils/checkValidation';
import { methodNotAllowed } from '../utils/methodNotAllowed';
import { uploadImportFile } from '../utils/uploadImportFile';
import {
  createPlacementValidation,
  getPlacementsValidation,
  getTransmittersValidation,
  importPlacementsValidation,
  placementIdValidation,
  updatePlacementValidation
} from '../validations/spainantennas.validations';

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: JWT token obtained from the opensesame authentication service
 *   responses:
 *     TooManyRequests:
 *       description: >
 *         Rate limit exceeded (per client IP, on every /api route). The RateLimit,
 *         RateLimit-Policy and Retry-After headers tell when to retry.
 *       headers:
 *         RateLimit:
 *           schema:
 *             type: string
 *             example: '"1000-in-15min"; r=0; t=540'
 *         RateLimit-Policy:
 *           schema:
 *             type: string
 *             example: '"1000-in-15min"; q=1000; w=900; pk=:MTJjYTE3YjQ5YWYy:'
 *         Retry-After:
 *           description: Seconds until the window resets
 *           schema:
 *             type: integer
 *             example: 540
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *           example:
 *             status: fail
 *             message: Too many requests, please try again later
 *   schemas:
 *     Location:
 *       type: object
 *       description: >
 *         Site coordinates. lat and lon are both set or both null (site not placed on the
 *         map yet). When set, they must be inside the Spain bounding box.
 *       properties:
 *         lat:
 *           type: number
 *           nullable: true
 *           minimum: 27
 *           maximum: 44
 *           example: 40.4168
 *         lon:
 *           type: number
 *           nullable: true
 *           minimum: -19
 *           maximum: 5
 *           example: -3.7038
 *         altM:
 *           type: number
 *           nullable: true
 *           description: Altitude in meters
 *           example: 657
 *     TransmitterInput:
 *       type: object
 *       additionalProperties: false
 *       required:
 *         - type
 *         - technology
 *         - stationName
 *         - broadcaster
 *         - source
 *       properties:
 *         type:
 *           type: string
 *           enum: [TV, radio]
 *           example: radio
 *         technology:
 *           type: string
 *           enum: [AM-LW, AM-MW, FM, TDT, DAB+]
 *           example: FM
 *         frequencykHz:
 *           type: number
 *           nullable: true
 *           exclusiveMinimum: true
 *           minimum: 0
 *           description: Frequency in kHz (FM too). Omitted means null.
 *           example: 88200
 *         stationName:
 *           type: string
 *           maxLength: 200
 *           example: Radio Nacional
 *         broadcaster:
 *           type: string
 *           maxLength: 200
 *           example: RTVE
 *         powerKw:
 *           type: number
 *           nullable: true
 *           minimum: 0
 *           description: Power in kW. Omitted means null.
 *           example: 10
 *         source:
 *           type: string
 *           maxLength: 5000
 *           example: Ministry FM list
 *     Transmitter:
 *       allOf:
 *         - type: object
 *           properties:
 *             _id:
 *               type: string
 *               description: MongoDB ObjectId
 *               example: "507f1f77bcf86cd799439012"
 *         - $ref: '#/components/schemas/TransmitterInput'
 *     PlacementInput:
 *       type: object
 *       additionalProperties: false
 *       description: >
 *         Unknown keys (and any _id) are rejected. lastUpdate is accepted but ignored: the
 *         server stamps it.
 *       required:
 *         - status
 *         - siteOperator
 *         - location
 *         - source
 *       properties:
 *         status:
 *           type: string
 *           enum: [active, inactive, unknown]
 *           example: active
 *         siteOperator:
 *           type: string
 *           maxLength: 200
 *           description: Use "unknown" if not known
 *           example: Cellnex
 *         location:
 *           $ref: '#/components/schemas/Location'
 *         postcode:
 *           type: string
 *           nullable: true
 *           pattern: '^\d{5}$'
 *           description: Omitted means null
 *           example: "28001"
 *         transmitters:
 *           type: array
 *           description: Omitted means empty
 *           items:
 *             $ref: '#/components/schemas/TransmitterInput'
 *         lastUpdate:
 *           type: string
 *           format: date-time
 *           description: Ignored
 *         source:
 *           type: string
 *           maxLength: 5000
 *           example: Ministry station data
 *     PlacementUpdateInput:
 *       type: object
 *       additionalProperties: false
 *       description: >
 *         Same as PlacementInput without transmitters. Any transmitters key (even [] or
 *         null) is rejected: use the transmitter endpoints. Unknown keys (and any _id) are
 *         rejected. lastUpdate is accepted but ignored: the server stamps it.
 *       required:
 *         - status
 *         - siteOperator
 *         - location
 *         - source
 *       properties:
 *         status:
 *           type: string
 *           enum: [active, inactive, unknown]
 *           example: active
 *         siteOperator:
 *           type: string
 *           maxLength: 200
 *           description: Use "unknown" if not known
 *           example: Cellnex
 *         location:
 *           $ref: '#/components/schemas/Location'
 *         postcode:
 *           type: string
 *           nullable: true
 *           pattern: '^\d{5}$'
 *           description: Omitted means null
 *           example: "28001"
 *         lastUpdate:
 *           type: string
 *           format: date-time
 *           description: Ignored
 *         source:
 *           type: string
 *           maxLength: 5000
 *           example: Ministry station data
 *     Placement:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: MongoDB ObjectId
 *           example: "507f1f77bcf86cd799439011"
 *         status:
 *           type: string
 *           enum: [active, inactive, unknown]
 *         siteOperator:
 *           type: string
 *         location:
 *           $ref: '#/components/schemas/Location'
 *         postcode:
 *           type: string
 *           nullable: true
 *         transmitters:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Transmitter'
 *         lastUpdate:
 *           type: string
 *           format: date-time
 *           description: Set by the server on every change
 *         source:
 *           type: string
 *     PlacementSummary:
 *       description: Placement without transmitters (fields=summary)
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: MongoDB ObjectId
 *           example: "507f1f77bcf86cd799439011"
 *         status:
 *           type: string
 *           enum: [active, inactive, unknown]
 *         siteOperator:
 *           type: string
 *         location:
 *           $ref: '#/components/schemas/Location'
 *         postcode:
 *           type: string
 *           nullable: true
 *         lastUpdate:
 *           type: string
 *           format: date-time
 *         source:
 *           type: string
 *     TransmitterListItem:
 *       allOf:
 *         - $ref: '#/components/schemas/Transmitter'
 *         - type: object
 *           properties:
 *             placementId:
 *               type: string
 *               description: ObjectId of the parent placement
 *               example: "507f1f77bcf86cd799439011"
 *             placement:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [active, inactive, unknown]
 *                 siteOperator:
 *                   type: string
 *                 location:
 *                   $ref: '#/components/schemas/Location'
 *                 postcode:
 *                   type: string
 *                   nullable: true
 *     ListMeta:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         page:
 *           type: integer
 *           example: 1
 *         perPage:
 *           type: integer
 *           description: Page size actually used (requested value capped at MAX_PERPAGE)
 *           example: 20
 *         totalPages:
 *           type: integer
 *           description: 0 when nothing matches
 *           example: 3
 *         total:
 *           type: integer
 *           example: 42
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [fail, error]
 *           example: fail
 *         message:
 *           type: string
 *           example: Error message
 *     ValidationErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: fail
 *         message:
 *           type: string
 *           example: Invalid input data
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 example: field
 *               value:
 *                 description: The offending value (absent on schema errors)
 *               msg:
 *                 type: string
 *                 example: Specific validation error message
 *               path:
 *                 type: string
 *                 example: location.lat
 *               location:
 *                 type: string
 *                 example: body
 *     ImportError:
 *       type: object
 *       properties:
 *         index:
 *           type: integer
 *           description: Position of the item in the file (0-based)
 *           example: 3
 *         message:
 *           type: string
 *           description: Every failing path of the item, separated by "; "
 *           example: 'location.lat: lat must be between 27 and 44; Unknown field: transmitters.0.foo'
 *     ImportSummary:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [success, fail]
 *           example: success
 *         message:
 *           type: string
 *           description: Only on 400
 *           example: No placements imported
 *         inserted:
 *           type: integer
 *           example: 4480
 *         failed:
 *           type: integer
 *           example: 1
 *         errors:
 *           type: array
 *           description: Failed items, sorted by index
 *           items:
 *             $ref: '#/components/schemas/ImportError'
 *     ImportDryRunSummary:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [success, fail]
 *           example: success
 *         message:
 *           type: string
 *           description: Only on 400
 *           example: No valid placements
 *         dryRun:
 *           type: boolean
 *           example: true
 *         valid:
 *           type: integer
 *           example: 4480
 *         failed:
 *           type: integer
 *           example: 1
 *         errors:
 *           type: array
 *           description: Failed items, sorted by index
 *           items:
 *             $ref: '#/components/schemas/ImportError'
 */

const router = express.Router();

/**
 * @openapi
 * /placement:
 *   get:
 *     summary: List placements
 *     description: >
 *       Public, paginated list sorted by _id. Filters are ANDed. Comma lists match any of
 *       their values (max 100 values). Text filters are case- and accent-insensitive
 *       partial matches (vowel accents, n/ñ, c/ç) and take a single term (commas are
 *       literal). Transmitter filters (type, technology, stationName, broadcaster) must
 *       all match the same transmitter; matching placements return all their transmitters.
 *       Each parameter may appear once and cannot be empty; unknown parameters are
 *       rejected. A single placement is GET /placement?id=... (list shape, empty results
 *       when not found).
 *     tags:
 *       - Placement
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: perPage
 *         description: Defaults to DEFAULT_PERPAGE; values above MAX_PERPAGE are capped
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: fields
 *         description: summary leaves transmitters out of each placement
 *         schema:
 *           type: string
 *           enum: [summary]
 *       - in: query
 *         name: id
 *         description: Placement ObjectId, or a comma-separated list of them
 *         schema:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: status
 *         description: Comma-separated list of active, inactive, unknown
 *         schema:
 *           type: string
 *           example: active,unknown
 *       - in: query
 *         name: siteOperator
 *         description: Partial match, case- and accent-insensitive
 *         schema:
 *           type: string
 *           maxLength: 200
 *           example: cellnex
 *       - in: query
 *         name: postcode
 *         description: 5-digit postcode, or a comma-separated list of them (exact match)
 *         schema:
 *           type: string
 *           example: "28001,28002"
 *       - in: query
 *         name: type
 *         description: Comma-separated list of TV, radio
 *         schema:
 *           type: string
 *           example: radio
 *       - in: query
 *         name: technology
 *         description: Comma-separated list of AM-LW, AM-MW, FM, TDT, DAB+ (encode + as %2B)
 *         schema:
 *           type: string
 *           example: FM,DAB%2B
 *       - in: query
 *         name: stationName
 *         description: Partial match, case- and accent-insensitive
 *         schema:
 *           type: string
 *           maxLength: 200
 *           example: espana
 *       - in: query
 *         name: broadcaster
 *         description: Partial match, case- and accent-insensitive
 *         schema:
 *           type: string
 *           maxLength: 200
 *           example: rtve
 *     responses:
 *       200:
 *         description: Page of placements (full, or summary with fields=summary)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ListMeta'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         oneOf:
 *                           - $ref: '#/components/schemas/Placement'
 *                           - $ref: '#/components/schemas/PlacementSummary'
 *       400:
 *         description: Invalid query (unknown, repeated or empty parameter, bad value)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *             example:
 *               status: fail
 *               message: Invalid input data
 *               errors:
 *                 - type: field
 *                   value: FM,XYZ
 *                   msg: "technology must be one of: AM-LW, AM-MW, FM, TDT, DAB+"
 *                   path: technology
 *                   location: query
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Internal server error
 *   post:
 *     summary: Create a placement
 *     description: >
 *       Creates a placement with optional transmitters. Nullable fields may be omitted (stored
 *       as null). Numbers must be JSON numbers. lastUpdate is set by the server.
 *     tags:
 *       - Placement
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlacementInput'
 *           example:
 *             status: active
 *             siteOperator: Cellnex
 *             location:
 *               lat: 40.4168
 *               lon: -3.7038
 *               altM: 657
 *             postcode: "28001"
 *             transmitters:
 *               - type: radio
 *                 technology: FM
 *                 frequencykHz: 88200
 *                 stationName: Radio Nacional
 *                 broadcaster: RTVE
 *                 powerKw: 10
 *                 source: Ministry FM list
 *             source: Ministry station data
 *     responses:
 *       201:
 *         description: Placement created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     placement:
 *                       $ref: '#/components/schemas/Placement'
 *       400:
 *         description: Validation error or malformed JSON body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *             example:
 *               status: fail
 *               message: Invalid input data
 *               errors:
 *                 - type: field
 *                   value: 50
 *                   msg: lat must be between 27 and 44
 *                   path: location.lat
 *                   location: body
 *       401:
 *         description: Missing, malformed or rejected token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: You are not logged in! Please log in to get access.
 *       413:
 *         description: Body larger than 1 MB
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: Request body too large
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Internal server error
 *       503:
 *         description: Authentication service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Authentication service unavailable
 */
router
  .route('/placement')
  .get(getPlacementsValidation, getPlacements)
  .post(protect, createPlacementValidation, createPlacement)
  .all(methodNotAllowed(['GET', 'POST']));

/**
 * @openapi
 * /placement/import:
 *   post:
 *     summary: Import placements from a JSON file
 *     description: >
 *       Imports a JSON array of placements in the data-file format (the export format is
 *       accepted too). Each item is validated with the database schema (types are cast, so
 *       "40.4" becomes 40.4); valid items are inserted and invalid ones reported by index.
 *       Incoming _id values are ignored (new ids are assigned) and each item's lastUpdate is
 *       kept (now when missing or null). No duplicate detection: importing a file twice
 *       inserts its placements twice. Meant to run locally against the target database for
 *       big files (Heroku's 30 s request limit).
 *     tags:
 *       - Placement
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dryRun
 *         required: false
 *         description: When true, validates every item and reports the summary without writing
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: >
 *                   JSON array of placements, sent as application/json (with curl:
 *                   -F "file=@TV.json;type=application/json"). At most IMPORT_MAX_SIZE_MB.
 *                   No other field is allowed.
 *     responses:
 *       200:
 *         description: >
 *           Dry run with at least one valid item (ImportDryRunSummary), or an empty array
 *           (ImportSummary or ImportDryRunSummary with zero counts)
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ImportDryRunSummary'
 *                 - $ref: '#/components/schemas/ImportSummary'
 *             example:
 *               status: success
 *               dryRun: true
 *               valid: 4480
 *               failed: 1
 *               errors:
 *                 - index: 3
 *                   message: 'location.lat: lat must be between 27 and 44'
 *       201:
 *         description: At least one placement inserted; failed items listed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportSummary'
 *             example:
 *               status: success
 *               inserted: 4480
 *               failed: 1
 *               errors:
 *                 - index: 3
 *                   message: 'location.lat: lat must be between 27 and 44'
 *       400:
 *         description: >
 *           No item inserted (ImportSummary) or, in a dry run, none valid
 *           (ImportDryRunSummary); invalid query (ValidationErrorResponse); or a bad upload
 *           (ErrorResponse): no file, extra fields or files, malformed multipart, invalid
 *           JSON, not an array
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ImportSummary'
 *                 - $ref: '#/components/schemas/ImportDryRunSummary'
 *                 - $ref: '#/components/schemas/ValidationErrorResponse'
 *                 - $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               nothingImported:
 *                 value:
 *                   status: fail
 *                   message: No placements imported
 *                   inserted: 0
 *                   failed: 1
 *                   errors:
 *                     - index: 0
 *                       message: 'Unknown field: foo'
 *               invalidJson:
 *                 value:
 *                   status: fail
 *                   message: Invalid JSON file
 *       401:
 *         description: Missing, malformed or rejected token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: You are not logged in! Please log in to get access.
 *       413:
 *         description: File larger than IMPORT_MAX_SIZE_MB
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: File too large
 *       415:
 *         description: File not sent as application/json
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: File must be application/json
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Internal server error (earlier batches may already be inserted)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Internal server error
 *       503:
 *         description: Authentication service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Authentication service unavailable
 */
// protect and the query check run before the upload: no file is buffered for them
router
  .route('/placement/import')
  .post(
    protect,
    importPlacementsValidation,
    rejectInvalidRequest,
    uploadImportFile,
    importPlacements
  )
  .all(methodNotAllowed(['POST']));

/**
 * @openapi
 * /placement/{id}:
 *   put:
 *     summary: Update a placement
 *     description: >
 *       Replaces every placement field (status, siteOperator, location, postcode, source).
 *       Transmitters are left untouched and cannot be sent. Nullable fields may be omitted
 *       (stored as null). Numbers must be JSON numbers. lastUpdate is set by the server.
 *     tags:
 *       - Placement
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Placement MongoDB ObjectId
 *         schema:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlacementUpdateInput'
 *           example:
 *             status: inactive
 *             siteOperator: Cellnex
 *             location:
 *               lat: 40.4168
 *               lon: -3.7038
 *               altM: 657
 *             postcode: "28001"
 *             source: Ministry station data
 *     responses:
 *       200:
 *         description: Placement updated, returned with its transmitters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     placement:
 *                       $ref: '#/components/schemas/Placement'
 *       400:
 *         description: Invalid id, validation error or malformed JSON body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *             example:
 *               status: fail
 *               message: Invalid input data
 *               errors:
 *                 - type: field
 *                   value: []
 *                   msg: transmitters cannot be changed here; use the transmitter endpoints
 *                   path: transmitters
 *                   location: body
 *       401:
 *         description: Missing, malformed or rejected token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: You are not logged in! Please log in to get access.
 *       404:
 *         description: No placement with that id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: No placement found with that ID
 *       413:
 *         description: Body larger than 1 MB
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: Request body too large
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Internal server error
 *       503:
 *         description: Authentication service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Authentication service unavailable
 *   delete:
 *     summary: Delete a placement
 *     description: >
 *       Deletes a placement and all its transmitters. Any request body or query string is
 *       ignored.
 *     tags:
 *       - Placement
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Placement MongoDB ObjectId
 *         schema:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *     responses:
 *       204:
 *         description: Placement deleted (no body)
 *       400:
 *         description: Invalid id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *             example:
 *               status: fail
 *               message: Invalid input data
 *               errors:
 *                 - type: field
 *                   value: abc
 *                   msg: id must be a valid MongoDB ObjectId
 *                   path: id
 *                   location: params
 *       401:
 *         description: Missing, malformed or rejected token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: You are not logged in! Please log in to get access.
 *       404:
 *         description: No placement with that id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: fail
 *               message: No placement found with that ID
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Internal server error
 *       503:
 *         description: Authentication service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Authentication service unavailable
 */
// /placement/import is registered above: its POST would otherwise get this route's 405
router
  .route('/placement/:id')
  .put(protect, updatePlacementValidation, updatePlacement)
  .delete(protect, placementIdValidation, deletePlacement)
  .all(methodNotAllowed(['PUT', 'DELETE']));

/**
 * @openapi
 * /transmitter:
 *   get:
 *     summary: List transmitters
 *     description: >
 *       Public, paginated list with one item per transmitter, each with a slice of its
 *       placement. Sorted by placement _id, then by the transmitters' stored order.
 *       Placements without transmitters yield nothing; sites without coordinates are
 *       included. Filters are ANDed. Comma lists match any of their values (max 100
 *       values). Text filters are case- and accent-insensitive partial matches (vowel
 *       accents, n/ñ, c/ç) and take a single term (commas are literal). Placement filters
 *       (placementId, status, siteOperator, postcode) apply to the parent placement;
 *       transmitter filters (type, technology, stationName, broadcaster) must all match
 *       the returned transmitter. Each parameter may appear once and cannot be empty;
 *       unknown parameters are rejected.
 *     tags:
 *       - Transmitter
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: perPage
 *         description: Defaults to DEFAULT_PERPAGE; values above MAX_PERPAGE are capped
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: placementId
 *         description: Placement ObjectId, or a comma-separated list of them
 *         schema:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *       - in: query
 *         name: status
 *         description: Placement status, comma-separated list of active, inactive, unknown
 *         schema:
 *           type: string
 *           example: active
 *       - in: query
 *         name: siteOperator
 *         description: Partial match, case- and accent-insensitive
 *         schema:
 *           type: string
 *           maxLength: 200
 *           example: cellnex
 *       - in: query
 *         name: postcode
 *         description: 5-digit postcode, or a comma-separated list of them (exact match)
 *         schema:
 *           type: string
 *           example: "28001,28002"
 *       - in: query
 *         name: type
 *         description: Comma-separated list of TV, radio
 *         schema:
 *           type: string
 *           example: radio
 *       - in: query
 *         name: technology
 *         description: Comma-separated list of AM-LW, AM-MW, FM, TDT, DAB+ (encode + as %2B)
 *         schema:
 *           type: string
 *           example: FM,DAB%2B
 *       - in: query
 *         name: stationName
 *         description: Partial match, case- and accent-insensitive
 *         schema:
 *           type: string
 *           maxLength: 200
 *           example: espana
 *       - in: query
 *         name: broadcaster
 *         description: Partial match, case- and accent-insensitive
 *         schema:
 *           type: string
 *           maxLength: 200
 *           example: rtve
 *     responses:
 *       200:
 *         description: Page of transmitters
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ListMeta'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TransmitterListItem'
 *       400:
 *         description: Invalid query (unknown, repeated or empty parameter, bad value)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *             example:
 *               status: fail
 *               message: Invalid input data
 *               errors:
 *                 - type: field
 *                   value: abc
 *                   msg: placementId must be a valid MongoDB ObjectId (or a comma-separated list of them)
 *                   path: placementId
 *                   location: query
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Internal server error
 */
router
  .route('/transmitter')
  .get(getTransmittersValidation, getTransmitters)
  .all(methodNotAllowed(['GET']));

export default router;
