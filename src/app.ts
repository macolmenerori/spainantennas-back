import cors from 'cors';
import express, { Request, Response } from 'express';

import spainantennasRouter from './routes/spainantennasRouter';
import errorHandler from './utils/errorHandler';

const app = express();

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
  credentials: true // Allow credentials (cookies) to be sent
};

app.use(cors(corsOptions));

// Handle preflight requests for complex requests (e.g., with credentials)
app.options('/*splat', cors(corsOptions));

// Parse JSON bodies, rejecting bodies bigger than 1 megabyte
app.use(express.json({ limit: '1mb' }));

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
