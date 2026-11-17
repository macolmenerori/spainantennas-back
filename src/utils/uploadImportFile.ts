import { NextFunction, Request, Response } from 'express';
import multer from 'multer';

// Multipart field that carries the import file
export const IMPORT_FILE_FIELD = 'file';

const IMPORT_MIMETYPE = 'application/json';

// Raised by the file filter; mapped to 415
class UnsupportedFileTypeError extends Error {}

// Client-facing message per multer error code; LIMIT_FILE_SIZE is handled apart (413)
const MULTER_MESSAGES: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_UNEXPECTED_FILE: `Unexpected file field; send the file in field "${IMPORT_FILE_FIELD}"`,
  LIMIT_FILE_COUNT: 'Only one file may be uploaded',
  LIMIT_FIELD_COUNT: `Only the "${IMPORT_FILE_FIELD}" field is allowed`,
  LIMIT_FIELD_KEY: `Only the "${IMPORT_FILE_FIELD}" field is allowed`,
  LIMIT_FIELD_VALUE: `Only the "${IMPORT_FILE_FIELD}" field is allowed`,
  LIMIT_PART_COUNT: 'Too many parts'
};

const fail = (res: Response, statusCode: number, message: string) =>
  res.status(statusCode).json({ status: 'fail', message });

/**
 * Builds the multer middleware, reading `IMPORT_MAX_SIZE_MB` at request time (like
 * `protect` reads its env), so the limit follows the environment.
 */
const buildUpload = () =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Number(process.env.IMPORT_MAX_SIZE_MB) * 1024 * 1024,
      files: 1,
      fields: 0
    },
    fileFilter: (req, file, callback) => {
      if (file.mimetype !== IMPORT_MIMETYPE) {
        callback(new UnsupportedFileTypeError());
        return;
      }
      callback(null, true);
    }
  }).single(IMPORT_FILE_FIELD);

/**
 * Middleware that buffers the import file (multipart field `file`, `application/json`,
 * at most `IMPORT_MAX_SIZE_MB`) into `req.file`. No other field or file is allowed.
 * A request that is not multipart passes through without `req.file`; the handler
 * reports the missing file.
 *
 * Responds 413 when the file is too large, 415 when it is not `application/json`, and
 * 400 for any other multipart problem (extra fields or files, malformed body).
 *
 * @example
 * ```typescript
 * router.post('/placement/import', protect, uploadImportFile, importPlacements);
 * ```
 */
export const uploadImportFile = (req: Request, res: Response, next: NextFunction): void => {
  buildUpload()(req, res, (err?: unknown) => {
    if (err === undefined) {
      next();
      return;
    }
    if (err instanceof UnsupportedFileTypeError) {
      fail(res, 415, `File must be ${IMPORT_MIMETYPE}`);
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        fail(res, 413, 'File too large');
        return;
      }
      fail(res, 400, MULTER_MESSAGES[err.code] ?? err.message);
      return;
    }
    // Anything else comes from busboy parsing the body (bad boundary, truncated form)
    fail(res, 400, 'Invalid multipart body');
  });
};
