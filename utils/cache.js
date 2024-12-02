const fetch = async (redis, key, fetcher, expires) => {
  const existing = await get(redis, key);
  if (existing !== null) return existing;

  return set(redis, key, fetcher, expires);
};

const get = async (redis, key) => {
  console.log('GET: ' + key);
  const value = await redis.get(key);
  if (value === null) return null;

  return JSON.parse(value);
};

const set = async (redis, key, fetcher, expires) => {
  console.log(`SET: ${key}, EXP: ${expires}`);
  const value = await fetcher();
  await redis.set(key, JSON.stringify(value), 'EX', expires);
  return value;
};

const del = async (redis, key) => {
  await redis.del(key);
};

export default { fetch, set, get, del };
