/* eslint-disable no-console */

const checkEnvVars = (): boolean => {
  const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'DATABASE',
    'AUTH_URL',
    'AUTH_TIMEOUT_MS',
    'RATELIMIT_MAXCONNECTIONS',
    'RATELIMIT_WINDOWMS',
    'CORS_WHITELIST'
  ];

  const missingEnvVars: string[] = [];

  requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      missingEnvVars.push(envVar);
    }
  });

  if (missingEnvVars.length > 0) {
    console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    return true;
  }

  // AbortSignal.timeout() throws on anything but a non-negative integer
  if (!/^[1-9]\d*$/.test(process.env.AUTH_TIMEOUT_MS!)) {
    console.error('AUTH_TIMEOUT_MS must be a positive integer (milliseconds)');
    return true;
  }

  return false;
};

export default checkEnvVars;
