import { createClient, RedisClientType } from "redis";
import { config } from "./config";
import { PendingVaccinationRow } from "./types";

const PENDING_VACCINATION_PREFIX = "vaccination:pending";
const CACHE_VERSION = "v1";

let redisClient: RedisClientType | null = null;

export const getRedisClient = async (): Promise<RedisClientType> => {
  if (redisClient?.isOpen) {
    return redisClient;
  }

  redisClient = createClient({ url: config.redisUrl });
  redisClient.on("error", (error: unknown) => {
    const now = new Date().toISOString();
    console.error(`[${now}] [REDIS ERROR]`, error);
  });

  await redisClient.connect();
  return redisClient;
};

export const buildPendingVaccinationCacheKey = (scope: string): string =>
  `${PENDING_VACCINATION_PREFIX}:${scope}:${CACHE_VERSION}`;

export const readPendingVaccinationCache = async (
  cacheKey: string
): Promise<PendingVaccinationRow[] | null> => {
  const client = await getRedisClient();
  const cached = await client.get(cacheKey);
  if (!cached) {
    return null;
  }

  return JSON.parse(cached) as PendingVaccinationRow[];
};

export const writePendingVaccinationCache = async (
  cacheKey: string,
  rows: PendingVaccinationRow[]
): Promise<void> => {
  const client = await getRedisClient();
  await client.set(cacheKey, JSON.stringify(rows), {
    EX: config.cacheTtlSeconds
  });
};

export const invalidatePendingVaccinationCache = async (): Promise<void> => {
  const client = await getRedisClient();

  const keysToDelete: string[] = [];
  for await (const key of client.scanIterator({
    MATCH: `${PENDING_VACCINATION_PREFIX}:*`,
    COUNT: 200
  })) {
    keysToDelete.push(key as string);
  }

  if (keysToDelete.length > 0) {
    await client.del(keysToDelete);
  }
};
