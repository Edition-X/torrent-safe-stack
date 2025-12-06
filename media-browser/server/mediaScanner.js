const fs = require('fs');
const path = require('path');

// Video file extensions to look for
const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.webm'];
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.sub', '.ass'];
const MIN_MOVIE_SIZE_BYTES = 200 * 1024 * 1024;

// Common patterns for parsing media filenames
const TV_PATTERNS = [
  // S01E01 format
  /^(.+?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,2})/,
  // 1x01 format
  /^(.+?)[.\s_-]+(\d{1,2})x(\d{1,2})/,
  // Season 1 Episode 1 format
  /^(.+?)[.\s_-]+Season[.\s_-]*(\d{1,2})[.\s_-]*Episode[.\s_-]*(\d{1,2})/i,
];

const YEAR_PATTERN = /[\.\s\(]*((?:19|20)\d{2})[\.\s\)]/;
const QUALITY_PATTERN = /(4K|2160p|1080p|720p|480p|HDRip|BluRay|WEB-DL|WEBRip|HDTV|DVDRip)/i;

/**
 * Parse a media filename to extract metadata
 */
function parseFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename, ext);
  
  // Try TV show patterns first
  for (const pattern of TV_PATTERNS) {
    const match = basename.match(pattern);
    if (match) {
      const showName = cleanTitle(match[1]);
      const season = parseInt(match[2], 10);
      const episode = parseInt(match[3], 10);
      
      // Extract quality
      const qualityMatch = basename.match(QUALITY_PATTERN);
      const quality = qualityMatch ? qualityMatch[1] : null;
      
      return {
        type: 'tv',
        title: showName,
        season,
        episode,
        quality,
        originalFilename: filename
      };
    }
  }
  
  // Try movie pattern (title + year)
  const yearMatch = basename.match(YEAR_PATTERN);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const titlePart = basename.substring(0, yearMatch.index);
    const title = cleanTitle(titlePart);
    
    const qualityMatch = basename.match(QUALITY_PATTERN);
    const quality = qualityMatch ? qualityMatch[1] : null;
    
    return {
      type: 'movie',
      title,
      year,
      quality,
      originalFilename: filename
    };
  }
  
  // Fallback - treat as movie with unknown year
  return {
    type: 'movie',
    title: cleanTitle(basename),
    year: null,
    quality: null,
    originalFilename: filename
  };
}

/**
 * Clean up a title by replacing dots/underscores with spaces
 */
function cleanTitle(title) {
  return title
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
}

/**
 * Recursively scan a directory for media files
 */
function scanDirectory(dirPath, basePath = null) {
  basePath = basePath || dirPath;
  const results = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      
      if (entry.isDirectory()) {
        // Skip hidden directories and quarantine
        if (entry.name.startsWith('.') || entry.name === 'quarantine') {
          continue;
        }
        // Recurse into subdirectories
        results.push(...scanDirectory(fullPath, basePath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        if (VIDEO_EXTENSIONS.includes(ext)) {
          const stats = fs.statSync(fullPath);
          const metadata = parseFilename(entry.name);
          
          // Look for associated subtitle files
          const subtitles = findSubtitles(dirPath, path.basename(entry.name, ext));
          
          results.push({
            ...metadata,
            path: relativePath,
            fullPath,
            size: stats.size,
            sizeFormatted: formatBytes(stats.size),
            modified: stats.mtime,
            subtitles: subtitles.map(s => path.relative(basePath, s))
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}:`, err.message);
  }
  
  return results;
}

/**
 * Find subtitle files that match a video filename
 */
function findSubtitles(directory, videoBasename) {
  const subtitles = [];
  
  try {
    const entries = fs.readdirSync(directory);
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (SUBTITLE_EXTENSIONS.includes(ext)) {
        // Check if subtitle filename starts with video basename
        const subtitleBase = path.basename(entry, ext);
        if (subtitleBase.startsWith(videoBasename) || videoBasename.startsWith(subtitleBase)) {
          subtitles.push(path.join(directory, entry));
        }
      }
    }
  } catch (err) {
    // Ignore errors
  }
  
  return subtitles;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Organize scanned media into a structured format
 */
function organizeMedia(mediaList) {
  const tvShows = {};
  const movies = [];
  const samples = [];
  
  for (const item of mediaList) {
    if (item.type === 'tv') {
      const showKey = item.title.toLowerCase();
      
      if (!tvShows[showKey]) {
        tvShows[showKey] = {
          id: generateId(item.title),
          title: item.title,
          type: 'tv',
          seasons: {}
        };
      }
      
      const seasonKey = `season_${item.season}`;
      if (!tvShows[showKey].seasons[seasonKey]) {
        tvShows[showKey].seasons[seasonKey] = {
          seasonNumber: item.season,
          episodes: []
        };
      }
      
      tvShows[showKey].seasons[seasonKey].episodes.push({
        episodeNumber: item.episode,
        title: `Episode ${item.episode}`,
        quality: item.quality,
        path: item.path,
        size: item.size,
        sizeFormatted: item.sizeFormatted,
        subtitles: item.subtitles
      });
      
      // Sort episodes
      tvShows[showKey].seasons[seasonKey].episodes.sort(
        (a, b) => a.episodeNumber - b.episodeNumber
      );
    } else {
      if (item.size < MIN_MOVIE_SIZE_BYTES) {
        samples.push({
          id: generateId(item.title + (item.year || '')),
          title: item.title,
          type: 'movie',
          year: item.year,
          quality: item.quality,
          path: item.path,
          size: item.size,
          sizeFormatted: item.sizeFormatted,
          subtitles: item.subtitles
        });
        continue;
      }

      movies.push({
        id: generateId(item.title + (item.year || '')),
        title: item.title,
        type: 'movie',
        year: item.year,
        quality: item.quality,
        path: item.path,
        size: item.size,
        sizeFormatted: item.sizeFormatted,
        subtitles: item.subtitles
      });
    }
  }
  
  // Convert tvShows object to array and sort seasons
  const tvShowsArray = Object.values(tvShows).map(show => ({
    ...show,
    seasons: Object.values(show.seasons).sort((a, b) => a.seasonNumber - b.seasonNumber),
    episodeCount: Object.values(show.seasons).reduce((sum, s) => sum + s.episodes.length, 0)
  }));
  
  // Sort alphabetically
  tvShowsArray.sort((a, b) => a.title.localeCompare(b.title));
  movies.sort((a, b) => a.title.localeCompare(b.title));
  samples.sort((a, b) => a.title.localeCompare(b.title));
  
  return {
    tvShows: tvShowsArray,
    movies,
    samples,
    stats: {
      totalTvShows: tvShowsArray.length,
      totalMovies: movies.length,
      totalEpisodes: tvShowsArray.reduce((sum, s) => sum + s.episodeCount, 0)
    }
  };
}

/**
 * Generate a simple ID from a string
 */
function generateId(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
}

module.exports = {
  parseFilename,
  scanDirectory,
  organizeMedia,
  cleanTitle,
  formatBytes,
  VIDEO_EXTENSIONS,
  SUBTITLE_EXTENSIONS
};
