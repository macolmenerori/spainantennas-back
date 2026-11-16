import mongoSanitize from '@exortek/express-mongo-sanitize';
import compression from 'compression';
import cors from 'cors';
import express, { Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

import spainantennasRouter from './routes/spainantennasRouter';
import errorHandler from './utils/errorHandler';

const app = express();

// Heroku's router is the one proxy in front: req.ip is the real client (rate limit key)
app.set('trust proxy', 1);

const cors_whitelist = process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : [];
const corsOptions = {
  origin: function (
    origin: string | undefined,

    callback: (err: Error | null, allow?: boolean) => void
  ) {
    // Check if the origin is in the whitelist
    if (cors_whitelist.indexOf(origin!) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials (cookies) to be sent
  // Let the front read the rate limit state cross-origin
  exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After']
};

app.use(cors(corsOptions));

// Handle preflight requests for complex requests (e.g., with credentials)
// CORS goes first: preflights end here (not counted by the rate limit) and 429s carry
// CORS headers the front can read
app.options('/*splat', cors(corsOptions));

// Security HTTP headers
app.use(helmet());

// Rate limit per client IP on the API (healthcheck exempt)
const limiter = rateLimit({
  limit: Number(process.env.RATELIMIT_MAXCONNECTIONS),
  windowMs: Number(process.env.RATELIMIT_WINDOWMS),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      status: 'fail',
      message: 'Too many requests, please try again later'
    });
  }
});
app.use('/api', limiter);

// Parse JSON bodies, rejecting bodies bigger than 1 megabyte
app.use(express.json({ limit: '1mb' }));

// NoSQL injection defense in depth (validators are the main guard): strips `$` from body
// and query keys and values, replacing it with '_'. Control chars (newlines) are kept.
app.use(mongoSanitize({ patterns: [/\$/g], replaceWith: '_' }));

// Compress responses
app.use(compression());

// Healthcheck
app.get('/healthcheck', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running'
  });
});

app.use('/api/v1', spainantennasRouter);

// Middleware for handling unhandled routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server`
  });
});

// JSON responses for body parse errors and anything unhandled
app.use(errorHandler);

export default app;
