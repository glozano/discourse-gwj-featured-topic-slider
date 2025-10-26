import { ajax } from "discourse/lib/ajax";

const CACHE_TTL_MS = 120000;
const CACHE = new Map();

function buildCacheKey({ tag, cacheContext = "default", includePinned, topicCount }) {
  return [
    tag?.toLowerCase() ?? "none",
    cacheContext,
    includePinned ? "with-pinned" : "no-pinned",
    topicCount || 0,
  ].join("|");
}

function storeInCache(key, topics) {
  CACHE.set(key, {
    timestamp: Date.now(),
    topics: Array.isArray(topics) ? topics.slice() : [],
  });
}

function readCache(key) {
  const record = CACHE.get(key);
  if (!record) {
    return null;
  }

  if (Date.now() - record.timestamp > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }

  return record.topics.slice();
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function sanitizeTopicCount(count) {
  if (typeof count !== "number" || Number.isNaN(count)) {
    return 0;
  }

  return Math.max(Math.min(Math.floor(count), 30), 0);
}

export async function fetchFeaturedTopics({
  tag,
  topicCount,
  includePinned,
  shuffle,
  cacheContext,
} = {}) {
  const safeCount = sanitizeTopicCount(topicCount);
  if (!tag || safeCount === 0) {
    return [];
  }

  const cacheKey = buildCacheKey({ tag, cacheContext, includePinned, topicCount: safeCount });
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  const effectivePerPage = includePinned ? safeCount : Math.min(safeCount * 2, 50);
  const url = `/tag/${encodeURIComponent(tag)}.json?no_definitions=true&per_page=${effectivePerPage}`;

  let response;
  try {
    response = await ajax(url);
  } catch (error) {
    throw error;
  }

  const rawTopics = response?.topic_list?.topics ?? [];
  let filtered = rawTopics;

  if (!includePinned) {
    filtered = filtered.filter((topic) => !topic.pinned);
  }

  const sliced = filtered.slice(0, safeCount);
  const processed = shuffle ? shuffleInPlace(sliced) : sliced;

  storeInCache(cacheKey, processed);

  return processed;
}

export function clearFeaturedTopicsCache(cacheContext) {
  if (!cacheContext) {
    CACHE.clear();
    return;
  }

  for (const key of CACHE.keys()) {
    if (key.includes(`|${cacheContext}|`)) {
      CACHE.delete(key);
    }
  }
}
