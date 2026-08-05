const fs = require('fs/promises');
const path = require('path');
const redis = require('redis');

const DATA_FILE = path.join(__dirname, '..', 'data', 'local-store.json');

function createEmptyStore() {
  return {
    strings: {},
    hashes: {},
    sets: {},
    lists: {},
  };
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return createEmptyStore();
  }
}

async function writeStore(store) {
  await ensureDataFile();
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmpFile, DATA_FILE);
}

// write queue برای جلوگیری از race condition و write amplification با بهینه‌سازی debounce پس‌زمینه
let _writeTimeout = null;
let _pendingSnapshot = null;
let _isWriting = false;

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function queuedSave(cache) {
  // گرفتن اسنپ‌شات درجا از دیتا جهت جلوگیری از از دست رفتن تغییرات بعدی
  _pendingSnapshot = cloneStore(cache);

  if (_writeTimeout) clearTimeout(_writeTimeout);

  const performWrite = async () => {
    if (_isWriting) {
      // اگر در حال نوشتن هستیم، کار را به تاخیر می‌اندازیم
      _writeTimeout = setTimeout(performWrite, 100);
      return;
    }
    _isWriting = true;
    try {
      const snapshot = _pendingSnapshot;
      if (snapshot) {
        await writeStore(snapshot);
      }
    } catch (err) {
      console.error('Failed to write local-store to disk:', err);
    } finally {
      _isWriting = false;
    }
  };

  _writeTimeout = setTimeout(performWrite, 500); // تاخیر ۵۰۰ میلی‌ثانیه‌ای برای دبانس دیسک

  return Promise.resolve('OK');
}

function normalizeValues(values) {
  if (values.length === 1 && Array.isArray(values[0])) return values[0];
  return values;
}

function createLocalClient() {
  let cache = createEmptyStore();

  const load = async () => {
    cache = await readStore();
  };

  const save = async () => {
    return queuedSave(cache);
  };

  const client = {
    isOpen: true,
    async connect() {
      await load();
      return client;
    },
    on() {},
    async get(key) {
      return cache.strings[key] ?? null;
    },
    async set(key, value) {
      cache.strings[key] = String(value);
      await save();
      return 'OK';
    },
    async exists(key) {
      return Number(
        Object.prototype.hasOwnProperty.call(cache.strings, key) ||
          Object.prototype.hasOwnProperty.call(cache.hashes, key) ||
          Object.prototype.hasOwnProperty.call(cache.sets, key) ||
          Object.prototype.hasOwnProperty.call(cache.lists, key)
      );
    },
    async del(...keys) {
      for (const key of keys) {
        delete cache.strings[key];
        delete cache.hashes[key];
        delete cache.sets[key];
        delete cache.lists[key];
      }
      await save();
      return keys.length;
    },
    async expire() {
      return 1;
    },
    async hGetAll(key) {
      return { ...(cache.hashes[key] || {}) };
    },
    async hGet(key, field) {
      return cache.hashes[key]?.[field] ?? null;
    },
    async hSet(key, fieldOrObject, value) {
      if (!cache.hashes[key]) cache.hashes[key] = {};
      if (typeof fieldOrObject === 'object' && fieldOrObject !== null && !Array.isArray(fieldOrObject)) {
        Object.entries(fieldOrObject).forEach(([k, v]) => {
          cache.hashes[key][k] = String(v);
        });
      } else {
        cache.hashes[key][fieldOrObject] = String(value);
      }
      await save();
      return 1;
    },
    async hExists(key, field) {
      return Number(Boolean(cache.hashes[key]?.[field] !== undefined));
    },
    async hDel(key, field) {
      if (cache.hashes[key]) {
        delete cache.hashes[key][field];
        await save();
      }
      return 1;
    },
    async sAdd(key, ...values) {
      const items = normalizeValues(values);
      if (!cache.sets[key]) cache.sets[key] = [];
      const existing = new Set(cache.sets[key]);
      for (const item of items) existing.add(String(item));
      cache.sets[key] = [...existing];
      await save();
      return cache.sets[key].length;
    },
    async sMembers(key) {
      return [...(cache.sets[key] || [])];
    },
    async sRem(key, ...values) {
      const items = normalizeValues(values).map(String);
      if (!cache.sets[key]) return 0;
      cache.sets[key] = cache.sets[key].filter((item) => !items.includes(String(item)));
      await save();
      return 1;
    },
    async sIsMember(key, value) {
      return Number((cache.sets[key] || []).includes(String(value)));
    },
    async rPush(key, value) {
      if (!cache.lists[key]) cache.lists[key] = [];
      cache.lists[key].push(value);
      await save();
      return cache.lists[key].length;
    },
    async lPush(key, ...values) {
      if (!cache.lists[key]) cache.lists[key] = [];
      const items = normalizeValues(values);
      for (const v of items) cache.lists[key].unshift(v);
      await save();
      return cache.lists[key].length;
    },
    async lTrim(key, start, end) {
      const list = cache.lists[key] || [];
      const len = list.length;
      const from = start < 0 ? Math.max(len + start, 0) : start;
      const to   = end   < 0 ? len + end                 : Math.min(end, len - 1);
      cache.lists[key] = list.slice(from, to + 1);
      await save();
      return 'OK';
    },
    async lRange(key, start, end) {
      const list = cache.lists[key] || [];
      const len = list.length;
      const from = start < 0 ? Math.max(len + start, 0) : start;
      const to = end < 0 ? len + end : end;
      return list.slice(from, to + 1);
    },
    async lLen(key) {
      return (cache.lists[key] || []).length;
    },
    async lIndex(key, index) {
      const list = cache.lists[key] || [];
      const idx = index < 0 ? list.length + index : index;
      return list[idx] ?? null;
    },
    async lSet(key, index, value) {
      if (!cache.lists[key]) cache.lists[key] = [];
      const list = cache.lists[key];
      const idx = index < 0 ? list.length + index : index;
      list[idx] = value;
      await save();
      return 'OK';
    },
    async lRem(key, count, value) {
      if (!cache.lists[key]) return 0;
      if (count === 0) {
        cache.lists[key] = cache.lists[key].filter((item) => item !== value);
      } else {
        const list = cache.lists[key];
        let remaining = Math.abs(count);
        const forward = count > 0;
        const indices = forward ? [...list.keys()] : [...list.keys()].reverse();
        for (const idx of indices) {
          if (list[idx] === value) {
            list.splice(idx, 1);
            remaining -= 1;
            if (remaining === 0) break;
          }
        }
      }
      await save();
      return 1;
    },
  };

  return client;
}

const hasRedisUrl = Boolean(process.env.REDIS_URL);
const redisClient = hasRedisUrl
  ? redis.createClient({ url: process.env.REDIS_URL })
  : null;

let useLocalStore = !hasRedisUrl;
const localClient = createLocalClient();

async function ensureRedisConnected() {
  if (useLocalStore) {
    await localClient.connect();
    return localClient;
  }
  try {
    if (redisClient && !redisClient.isOpen) {
      await redisClient.connect();
    }
    return redisClient || localClient;
  } catch (error) {
    useLocalStore = true;
    await localClient.connect();
    return localClient;
  }
}

if (redisClient) {
  redisClient.on('error', async () => {
    if (!useLocalStore) {
      useLocalStore = true;
      await localClient.connect();
    }
  });
}

module.exports = {
  redisClient: new Proxy(redisClient || {}, {
    get(target, prop) {
      if (useLocalStore) {
        const value = localClient[prop];
        if (typeof value === 'function') return value.bind(localClient);
        return value;
      }
      if (!target) {
        const value = localClient[prop];
        if (typeof value === 'function') return value.bind(localClient);
        return value;
      }
      const value = target[prop];
      if (typeof value === 'function') return value.bind(target);
      return value;
    },
  }),
  ensureRedisConnected,
};
