type AppConfig = {
  port: number;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redisUrl: string;
  cacheTtlSeconds: number;
};

const readEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const readIntEnv = (key: string, fallback: string): number => {
  const raw = readEnv(key, fallback);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer`);
  }
  return parsed;
};

export const config: AppConfig = {
  port: readIntEnv("PORT", "3000"),
  db: {
    host: readEnv("DB_HOST", "localhost"),
    port: readIntEnv("DB_PORT", "5432"),
    name: readEnv("DB_NAME", "clinica_vet"),
    user: readEnv("DB_USER", "api_user"),
    password: readEnv("DB_PASSWORD", "api_pass")
  },
  redisUrl: readEnv("REDIS_URL", "redis://localhost:6379"),
  cacheTtlSeconds: readIntEnv("CACHE_TTL_SECONDS", "300")
};
