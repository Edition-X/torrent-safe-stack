const fs = require('fs');
const path = require('path');

// Persistent storage location (mounted volume)
const DATA_DIR = process.env.DATA_PATH || '/data';
const HISTORY_FILE = path.join(DATA_DIR, 'watch-history.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load watch history from disk
 */
function loadHistory() {
  ensureDataDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[WatchHistory] Error loading history:', err);
  }
  return { items: [] };
}

/**
 * Save watch history to disk
 */
function saveHistory(history) {
  ensureDataDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('[WatchHistory] Error saving history:', err);
  }
}

/**
 * Update or add a watch progress entry
 *
 * This keeps a lifetime history of everything watched, including:
 * - firstWatched: when this item was first played
 * - timesWatched: how many times it has been completed
 * - completedAt: when it was last completed
 * - status: 'in_progress' | 'completed'
 */
function updateProgress(entry) {
  const history = loadHistory();

  // Find existing entry for this path
  const existingIndex = history.items.findIndex(item => item.path === entry.path);
  const existing = existingIndex >= 0 ? history.items[existingIndex] : null;

  const now = new Date().toISOString();
  const duration = entry.duration != null ? entry.duration : (existing ? existing.duration : 0);
  const currentTime = entry.currentTime != null ? entry.currentTime : (existing ? existing.currentTime : 0);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const previousStatus = existing ? existing.status : null;
  const status = progress >= 95 ? 'completed' : 'in_progress';

  // Track how many times an item has been fully watched
  let timesWatched = existing && typeof existing.timesWatched === 'number' ? existing.timesWatched : 0;
  const wasCompleted = previousStatus === 'completed';
  if (!wasCompleted && status === 'completed') {
    timesWatched += 1;
  }

  const firstWatched = existing && existing.firstWatched ? existing.firstWatched : (existing && existing.lastWatched ? existing.lastWatched : now);
  const completedAt = status === 'completed'
    ? now
    : (existing && existing.completedAt ? existing.completedAt : null);

  const newEntry = {
    // Preserve any unknown fields from existing entries for backwards compatibility
    ...(existing || {}),
    path: entry.path,
    title: entry.title,
    type: entry.type || (existing ? existing.type : 'movie'), // 'movie' or 'episode'
    showId: entry.showId || (existing ? existing.showId : null),
    showTitle: entry.showTitle || (existing ? existing.showTitle : null),
    season: entry.season != null ? entry.season : (existing ? existing.season : null),
    episode: entry.episode != null ? entry.episode : (existing ? existing.episode : null),
    currentTime,
    duration,
    progress,
    lastWatched: now,
    firstWatched,
    timesWatched,
    completedAt,
    status
  };

  if (existingIndex >= 0) {
    // Update existing entry
    history.items[existingIndex] = newEntry;
  } else {
    // Add new entry at the beginning
    history.items.unshift(newEntry);
  }

  // Sort by lastWatched (most recent first)
  history.items.sort((a, b) => new Date(b.lastWatched) - new Date(a.lastWatched));

  saveHistory(history);
  return newEntry;
}

/**
 * Get the most recently watched item that isn't finished
 */
function getContinueWatching() {
  const history = loadHistory();
  
  // Find the first item that isn't finished (< 95% progress)
  const continueItem = history.items.find(item => item.progress < 95);
  
  return continueItem || null;
}

/**
 * Get all watch history items
 */
function getAllHistory() {
  const history = loadHistory();
  return history.items;
}

/**
 * Get progress for a specific path
 */
function getProgress(videoPath) {
  const history = loadHistory();
  return history.items.find(item => item.path === videoPath) || null;
}

/**
 * Mark an item as finished (remove from continue watching)
 */
function markFinished(videoPath) {
  const history = loadHistory();
  const item = history.items.find(item => item.path === videoPath);
  if (item) {
    const now = new Date().toISOString();
    item.progress = 100;
    item.currentTime = item.duration;
    item.status = 'completed';
    item.timesWatched = (typeof item.timesWatched === 'number' ? item.timesWatched : 0) + 1;
    item.completedAt = now;
    if (!item.firstWatched) {
      item.firstWatched = item.lastWatched || now;
    }
    item.lastWatched = now;
    saveHistory(history);
  }
  return item;
}

module.exports = {
  updateProgress,
  getContinueWatching,
  getAllHistory,
  getProgress,
  markFinished
};
