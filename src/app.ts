import cors from 'cors';
import express, { Request, Response } from 'express';

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

// Healthcheck
app.get('/healthcheck', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running'
  });
});

// Middleware for handling unhandled routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server`
  });
});

export default app;
