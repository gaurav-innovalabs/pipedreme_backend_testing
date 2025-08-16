import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// structure
export class SubInternalAppInfo {
  constructor({ path, relative_path, file_name }) {
    this.path = path;
    this.relative_path = relative_path;
    this.file_name = file_name;
  }

  toJSON() {
    return {
      path: this.path,
      relative_path: this.relative_path,
      file_name: this.file_name
    };
  }
}

export class InternalAppInfo {
  constructor({
    path,
    actions_name = {},
    triggers_name = {},
    main_file_name
  }) {
    this.path = path;
    this.actions_name = actions_name; // { [slug]: SubInternalAppInfo }
    this.triggers_name = triggers_name; // { [slug]: SubInternalAppInfo }
    this.main_file_name = main_file_name;
  }

  toJSON() {
    return {
      path: this.path,
      actions_name: this.actions_name,
      triggers_name: this.triggers_name,
      main_file_name: this.main_file_name
    };
  }
}

/**
 * ---- Startup Clear ----
 */
async function clearAllStartupCache() {
  const patterns = [
    'internal:apps:*',
    'fetch_cache:apps:*',
    'fetch_cache:components:*:*'
  ];

  let totalCleared = 0;

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length) {
      await redis.del(keys);
      totalCleared += keys.length;
    }
  }
  console.log(`Cleared ${totalCleared} cache entries on startup`);
}

/**
 * ---- Internal Apps ----
 */
const InternalAppsCache = {
  async get() {
    const data = await redis.get('internal:apps');
    return data ? JSON.parse(data) : null;
  },
  async set(value) {
    await redis.set('internal:apps', JSON.stringify(value));
  },
  async reset() {
    await redis.del('internal:apps');
  }
};

/**
 * ---- Per App ----
 */
const AppCache = {
  key(appSlug) {
    return `fetch_cache:apps:${appSlug}`;
  },
  async get(appSlug) {
    const data = await redis.get(this.key(appSlug));
    return data ? JSON.parse(data) : null;
  },
  async set(appSlug, value) {
    await redis.set(this.key(appSlug), JSON.stringify(value));
  },
  async reset(appSlug) {
    await redis.del(this.key(appSlug));
  }
};

/**
 * ---- Per Component ----
 */
const ComponentCache = {
  key(componentId, component_type) {
    return `fetch_cache:components:${component_type}:${componentId}`;
  },
  async get(componentId, component_type) {
    const data = await redis.get(this.key(componentId, component_type));
    return data ? JSON.parse(data) : null;
  },
  async set(componentId, component_type, value) {
    await redis.set(this.key(componentId, component_type), JSON.stringify(value));
  },
  async reset(componentId, component_type) {
    await redis.del(this.key(componentId, component_type));
  }
};

// Run at startup
clearAllStartupCache();

export default redis;
export { InternalAppsCache, AppCache, ComponentCache, clearAllStartupCache };
