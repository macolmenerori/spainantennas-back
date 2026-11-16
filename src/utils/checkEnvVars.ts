/* eslint-disable no-console */

const isPositiveInteger = (value: string): boolean => /^[1-9]\d*$/.test(value);

const checkEnvVars = (): boolean => {
  const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'DATABASE',
    'AUTH_URL',
    'AUTH_TIMEOUT_MS',
    'RATELIMIT_MAXCONNECTIONS',
    'RATELIMIT_WINDOWMS',
    'CORS_WHITELIST',
    'DEFAULT_PERPAGE',
    'MAX_PERPAGE'
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
  if (!isPositiveInteger(process.env.AUTH_TIMEOUT_MS!)) {
    console.error('AUTH_TIMEOUT_MS must be a positive integer (milliseconds)');
    return true;
  }

  const notPositive = ['DEFAULT_PERPAGE', 'MAX_PERPAGE'].filter(
    (envVar) => !isPositiveInteger(process.env[envVar]!)
  );
  if (notPositive.length > 0) {
    console.error(`${notPositive.join(', ')} must be positive integers`);
    return true;
  }

  if (Number(process.env.DEFAULT_PERPAGE) > Number(process.env.MAX_PERPAGE)) {
    console.error('DEFAULT_PERPAGE cannot be greater than MAX_PERPAGE');
    return true;
  }

  return false;
};

export default checkEnvVars;
