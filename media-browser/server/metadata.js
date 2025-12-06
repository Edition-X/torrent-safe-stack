const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// TMDB API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
// Image sizes - use original for backdrops (hero images), w500 for posters/thumbnails
const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';

// Cache directory for metadata
const CACHE_DIR = '/tmp/danflix-metadata';

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate cache key from title
 */
function getCacheKey(title, type) {
  return crypto.createHash('md5').update(`${type}:${title.toLowerCase()}`).digest('hex');
}

/**
 * Get cached metadata
 */
function getCachedMetadata(title, type) {
  const cacheFile = path.join(CACHE_DIR, `${getCacheKey(title, type)}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      // Cache for 7 days
      if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return data.metadata;
      }
    } catch (err) {
      // Invalid cache, ignore
    }
  }
  return null;
}

/**
 * Save metadata to cache
 */
function cacheMetadata(title, type, metadata) {
  const cacheFile = path.join(CACHE_DIR, `${getCacheKey(title, type)}.json`);
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({
      timestamp: Date.now(),
      metadata
    }));
  } catch (err) {
    console.error('[Metadata] Cache write error:', err);
  }
}

/**
 * Clean title for search (remove year, quality info, etc.)
 */
function cleanTitle(title) {
  return title
    .replace(/\(\d{4}\)/g, '')           // Remove (year)
    .replace(/\d{4}/g, '')               // Remove year
    .replace(/S\d+E\d+/gi, '')           // Remove S01E01
    .replace(/\d+p/gi, '')               // Remove 720p, 1080p, etc.
    .replace(/WEB[-.]?DL/gi, '')
    .replace(/BluRay/gi, '')
    .replace(/HDTV/gi, '')
    .replace(/x26[45]/gi, '')
    .replace(/HEVC/gi, '')
    .replace(/H\.?264/gi, '')
    .replace(/AAC/gi, '')
    .replace(/\[.*?\]/g, '')             // Remove [tags]
    .replace(/\(.*?\)/g, '')             // Remove (tags)
    .replace(/[-_.]/g, ' ')              // Replace separators with spaces
    .replace(/\s+/g, ' ')                // Collapse whitespace
    .trim();
}

/**
 * Extract year from title if present
 */
function extractYear(title) {
  const match = title.match(/\((\d{4})\)/) || title.match(/\.(\d{4})\./);
  return match ? parseInt(match[1]) : null;
}

/**
 * Fetch movie metadata from TMDB
 */
async function fetchMovieMetadata(title, year = null) {
  if (!TMDB_API_KEY) {
    return null;
  }

  const cleanedTitle = cleanTitle(title);
  const searchYear = year || extractYear(title);
  
  try {
    let url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanedTitle)}`;
    if (searchYear) {
      url += `&year=${searchYear}`;
    }

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      // Try without year
      if (searchYear) {
        const retryUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanedTitle)}`;
        const retryResponse = await fetch(retryUrl);
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          if (retryData.results && retryData.results.length > 0) {
            return formatMovieResult(retryData.results[0]);
          }
        }
      }
      return null;
    }

    return formatMovieResult(data.results[0]);
  } catch (err) {
    console.error('[Metadata] TMDB movie search error:', err);
    return null;
  }
}

/**
 * Fetch TV show metadata from TMDB
 */
async function fetchTvMetadata(title) {
  if (!TMDB_API_KEY) {
    return null;
  }

  const cleanedTitle = cleanTitle(title);
  
  try {
    const url = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanedTitle)}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return null;
    }

    return formatTvResult(data.results[0]);
  } catch (err) {
    console.error('[Metadata] TMDB TV search error:', err);
    return null;
  }
}

/**
 * Format movie result
 */
function formatMovieResult(movie) {
  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    posterPath: movie.poster_path ? `${TMDB_POSTER_BASE}${movie.poster_path}` : null,
    backdropPath: movie.backdrop_path ? `${TMDB_BACKDROP_BASE}${movie.backdrop_path}` : null,
    releaseDate: movie.release_date,
    rating: movie.vote_average
  };
}

/**
 * Format TV result
 */
function formatTvResult(tv) {
  return {
    id: tv.id,
    title: tv.name,
    overview: tv.overview,
    posterPath: tv.poster_path ? `${TMDB_POSTER_BASE}${tv.poster_path}` : null,
    backdropPath: tv.backdrop_path ? `${TMDB_BACKDROP_BASE}${tv.backdrop_path}` : null,
    firstAirDate: tv.first_air_date,
    rating: tv.vote_average
  };
}

/**
 * Get metadata for a movie (with caching)
 */
async function getMovieMetadata(title, year = null) {
  // Check cache first
  const cached = getCachedMetadata(title, 'movie');
  if (cached !== null) {
    return cached;
  }

  // Fetch from TMDB
  const metadata = await fetchMovieMetadata(title, year);
  
  // Cache result (even if null to avoid repeated failed lookups)
  cacheMetadata(title, 'movie', metadata);
  
  return metadata;
}

/**
 * Get metadata for a TV show (with caching)
 */
async function getTvMetadata(title) {
  // Check cache first
  const cached = getCachedMetadata(title, 'tv');
  if (cached !== null) {
    return cached;
  }

  // Fetch from TMDB
  const metadata = await fetchTvMetadata(title);
  
  // Cache result
  cacheMetadata(title, 'tv', metadata);
  
  return metadata;
}

/**
 * Fetch detailed TV show info with seasons from TMDB
 */
async function fetchTvShowDetails(tmdbId) {
  if (!TMDB_API_KEY) return null;
  
  try {
    const url = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      id: data.id,
      title: data.name,
      overview: data.overview,
      posterPath: data.poster_path ? `${TMDB_POSTER_BASE}${data.poster_path}` : null,
      backdropPath: data.backdrop_path ? `${TMDB_BACKDROP_BASE}${data.backdrop_path}` : null,
      firstAirDate: data.first_air_date,
      rating: data.vote_average,
      genres: data.genres?.map(g => g.name) || [],
      numberOfSeasons: data.number_of_seasons,
      numberOfEpisodes: data.number_of_episodes,
      status: data.status,
      networks: data.networks?.map(n => n.name) || [],
      seasons: data.seasons?.map(s => ({
        seasonNumber: s.season_number,
        name: s.name,
        overview: s.overview,
        episodeCount: s.episode_count,
        airDate: s.air_date,
        posterPath: s.poster_path ? `${TMDB_POSTER_BASE}${s.poster_path}` : null
      })) || []
    };
  } catch (err) {
    console.error('[Metadata] TMDB TV details error:', err);
    return null;
  }
}

/**
 * Fetch season details with episodes from TMDB
 */
async function fetchSeasonDetails(tmdbId, seasonNumber) {
  if (!TMDB_API_KEY) return null;
  
  try {
    const url = `${TMDB_BASE_URL}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Still image base for episode thumbnails
    const TMDB_STILL_BASE = 'https://image.tmdb.org/t/p/w300';
    
    return {
      seasonNumber: data.season_number,
      name: data.name,
      overview: data.overview,
      airDate: data.air_date,
      posterPath: data.poster_path ? `${TMDB_POSTER_BASE}${data.poster_path}` : null,
      episodes: data.episodes?.map(ep => ({
        episodeNumber: ep.episode_number,
        name: ep.name,
        overview: ep.overview,
        airDate: ep.air_date,
        runtime: ep.runtime,
        stillPath: ep.still_path ? `${TMDB_STILL_BASE}${ep.still_path}` : null,
        rating: ep.vote_average
      })) || []
    };
  } catch (err) {
    console.error('[Metadata] TMDB season details error:', err);
    return null;
  }
}

/**
 * Get detailed TV show metadata with season info (with caching)
 */
async function getTvShowDetails(title) {
  // Check cache first
  const cacheKey = `${title}_details`;
  const cached = getCachedMetadata(cacheKey, 'tv');
  if (cached !== null) {
    return cached;
  }

  // First get basic metadata to get TMDB ID
  const basicMeta = await getTvMetadata(title);
  if (!basicMeta?.id) return null;

  // Fetch detailed info
  const details = await fetchTvShowDetails(basicMeta.id);
  
  // Cache result
  cacheMetadata(cacheKey, 'tv', details);
  
  return details;
}

/**
 * Get season episodes metadata (with caching)
 */
async function getSeasonEpisodes(title, seasonNumber) {
  // Check cache first
  const cacheKey = `${title}_s${seasonNumber}`;
  const cached = getCachedMetadata(cacheKey, 'tv');
  if (cached !== null) {
    return cached;
  }

  // First get basic metadata to get TMDB ID
  const basicMeta = await getTvMetadata(title);
  if (!basicMeta?.id) return null;

  // Fetch season details
  const seasonDetails = await fetchSeasonDetails(basicMeta.id, seasonNumber);
  
  // Cache result
  cacheMetadata(cacheKey, 'tv', seasonDetails);
  
  return seasonDetails;
}

/**
 * Check if TMDB API is configured
 */
function isConfigured() {
  return !!TMDB_API_KEY;
}

module.exports = {
  getMovieMetadata,
  getTvMetadata,
  getTvShowDetails,
  getSeasonEpisodes,
  isConfigured,
  cleanTitle,
  extractYear
};
