/* eslint-disable no-console */
import dotenv from 'dotenv';

import checkEnvVars from './utils/checkEnvVars';
import app from './app';
dotenv.config({ path: './config.env' });

// Check that all env vars are set up
if (checkEnvVars()) {
  process.exit(1);
}

process.on('uncaughtException', (err: Error) => {
  console.log(err.name, err.message);
  console.log('UNCAUGHT EXCEPTION! Shutting down...');
  process.exit(1);
});

const port = process.env.PORT || 8080;

const server = app.listen(port, (error?: Error) => {
  if (error) {
    console.log('Error starting server:', error.message);
    process.exit(1);
  }
  console.log(`App running on port ${port}...`);
});

process.on('unhandledRejection', (err: Error) => {
  console.log(err.name, err.message);
  console.log('UNHANDLED REJECTION! Shutting down...');
  server.close(() => {
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Shutting down gracefully.');
  server.close(() => {
    console.log('Process terminated!');
  });
});
