import { useState, useEffect } from 'react';

const API_BASE = '/api';

export function useMediaLibrary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/media`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch media library');
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    fetch(`${API_BASE}/media?refresh=true`)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  };

  return { data, loading, error, refresh };
}

export function useTvShows() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/tv`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch TV shows');
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

/**
 * Hook to get full watch history
 */
export function useWatchHistory() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWatchHistory()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useTvShow(id) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/tv/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('TV show not found');
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading, error };
}

export function useMovies() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/movies`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch movies');
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useSearch(query) {
  const [data, setData] = useState({ tvShows: [], movies: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!query || query.length < 2) {
      setData({ tvShows: [], movies: [] });
      return;
    }

    setLoading(true);
    fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`)
      .then(res => {
        if (!res.ok) throw new Error('Search failed');
        return res.json();
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [query]);

  return { data, loading, error };
}

export function getStreamUrl(path) {
  return `${API_BASE}/stream/${encodeURIComponent(path)}`;
}

export function getTranscodeUrl(path) {
  return `${API_BASE}/transcode/${encodeURIComponent(path)}`;
}

export function getSubtitleUrl(path) {
  return `${API_BASE}/subtitle/${encodeURIComponent(path)}`;
}

export function getAutoSubtitleUrl(path) {
  return `${API_BASE}/auto-subtitle/${encodeURIComponent(path)}`;
}

export function getThumbnailUrl(path) {
  return `${API_BASE}/thumbnail/${encodeURIComponent(path)}`;
}

export async function fetchPosterUrl(type, title, year = null) {
  try {
    let url = `${API_BASE}/poster/${type}/${encodeURIComponent(title)}`;
    if (year) url += `?year=${year}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data.posterUrl;
  } catch {
    return null;
  }
}

export async function fetchBackdropUrl(type, title, year = null) {
  try {
    let url = `${API_BASE}/poster/${type}/${encodeURIComponent(title)}`;
    if (year) url += `?year=${year}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data.backdropUrl;
  } catch {
    return null;
  }
}

/**
 * Fetch detailed TV show metadata from TMDB
 */
export async function fetchTvDetails(title) {
  try {
    const response = await fetch(`${API_BASE}/tv-details/${encodeURIComponent(title)}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.configured || data.error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch season episode details from TMDB
 */
export async function fetchSeasonEpisodes(title, seasonNumber) {
  try {
    const response = await fetch(`${API_BASE}/season-episodes/${encodeURIComponent(title)}/${seasonNumber}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.configured || data.error) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch full watch history (lifetime)
 */
export async function fetchWatchHistory() {
  try {
    const response = await fetch(`${API_BASE}/watch-history`);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

/**
 * Fetch media info for a video file
 * Returns codec info and whether transcoding is needed
 */
export async function fetchMediaInfo(path) {
  const response = await fetch(`${API_BASE}/media-info/${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch media info');
  }
  return response.json();
}

/**
 * Hook to get media info for a video file
 */
export function useMediaInfo(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchMediaInfo(path)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [path]);

  return { data, loading, error };
}

/**
 * Save watch progress to server
 */
export async function saveWatchProgress(data) {
  try {
    const response = await fetch(`${API_BASE}/watch-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('Failed to save progress');
    return response.json();
  } catch (err) {
    console.error('Error saving watch progress:', err);
    return null;
  }
}

/**
 * Get continue watching item
 */
export async function fetchContinueWatching() {
  try {
    const response = await fetch(`${API_BASE}/continue-watching`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Get watch progress for a specific video
 */
export async function fetchWatchProgress(videoPath) {
  try {
    const response = await fetch(`${API_BASE}/watch-progress/${encodeURIComponent(videoPath)}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

/**
 * Hook to get continue watching
 */
export function useContinueWatching() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContinueWatching()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    fetchContinueWatching()
      .then(setData)
      .finally(() => setLoading(false));
  };

  return { data, loading, refresh };
}

// ============================================
// EPISODE MARKERS (Skip Intro, Next Episode)
// ============================================

/**
 * Fetch episode markers (intro/outro times) for a video
 */
export async function fetchEpisodeMarkers(videoPath) {
  try {
    const response = await fetch(`${API_BASE}/episode-markers/${encodeURIComponent(videoPath)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Save a user-contributed episode marker
 */
export async function saveEpisodeMarker(videoPath, markerType, time) {
  try {
    const response = await fetch(`${API_BASE}/episode-markers/${encodeURIComponent(videoPath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markerType, time })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch next episode info for current video
 */
export async function fetchNextEpisode(videoPath) {
  try {
    const response = await fetch(`${API_BASE}/next-episode/${encodeURIComponent(videoPath)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
