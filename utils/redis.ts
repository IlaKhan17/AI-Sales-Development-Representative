import Redis from "ioredis";

// Lazy singleton: don't connect (or throw) at module load — that would break
// every page importing this file at build time when REDIS_URL is unset.
let client: Redis | null = null;

export function getRedis(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("REDIS_URL is not set — Redis-backed features are disabled");
    return null;
  }
  if (!client) {
    client = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  }
  return client;
}

export default getRedis;
