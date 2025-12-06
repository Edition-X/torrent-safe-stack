const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const { scanDirectory, organizeMedia } = require('./mediaScanner');
const { probeMedia, createTranscodeStream, likelyNeedsTranscode } = require('./transcoder');
const { generateThumbnail, isCached, getCachePath, preGenerateThumbnails } = require('./thumbnails');
const { getMovieMetadata, getTvMetadata, getTvShowDetails, getSeasonEpisodes, isConfigured: isTmdbConfigured } = require('./metadata');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { updateProgress, getContinueWatching, getAllHistory, getProgress } = require('./watchHistory');
const { getSubtitles, isConfigured: isSubtitlesConfigured } = require('./subtitles');
const { getEpisodeMarkers, saveEpisodeMarker, getNextEpisode } = require('./episodeMarkers');

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_PATH = process.env.DOWNLOADS_PATH || '/downloads';
const QBITTORRENT_URL = process.env.QBITTORRENT_URL || 'http://qbittorrent:8080';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text({ limit: '5mb' })); // For subtitle uploads

// qBittorrent reverse proxy - strip headers that prevent iframe embedding
app.use('/qbt', createProxyMiddleware({
  target: QBITTORRENT_URL,
  changeOrigin: true,
  pathRewrite: { '^/qbt': '' },
  ws: true, // WebSocket support
  on: {
    proxyRes: (proxyRes, req, res) => {
      // Remove X-Frame-Options header (check all case variations)
      Object.keys(proxyRes.headers).forEach(key => {
        if (key.toLowerCase() === 'x-frame-options') {
          delete proxyRes.headers[key];
        }
        // Modify CSP to remove frame-ancestors
        if (key.toLowerCase() === 'content-security-policy') {
          proxyRes.headers[key] = proxyRes.headers[key]
            .replace(/frame-ancestors[^;]*(;|$)/gi, '')
            .replace(/;;/g, ';')
            .trim();
        }
        // Modify Set-Cookie to allow iframe access (change SameSite from Strict to Lax)
        if (key.toLowerCase() === 'set-cookie') {
          const cookies = Array.isArray(proxyRes.headers[key]) 
            ? proxyRes.headers[key] 
            : [proxyRes.headers[key]];
          proxyRes.headers[key] = cookies.map(cookie => 
            cookie.replace(/SameSite=Strict/gi, 'SameSite=Lax')
          );
        }
      });
    },
    error: (err, req, res) => {
      console.error('[Proxy] qBittorrent proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'qBittorrent is not accessible' });
      }
    }
  }
}));

// Cache for media library (refreshed on demand)
let mediaCache = null;
let lastScan = null;
const CACHE_DURATION = 60000; // 1 minute

/**
 * Get media library (with caching)
 */
function getMediaLibrary(forceRefresh = false) {
  const now = Date.now();
  
  if (!forceRefresh && mediaCache && lastScan && (now - lastScan) < CACHE_DURATION) {
    return mediaCache;
  }
  
  console.log('Scanning media library...');
  const rawMedia = scanDirectory(DOWNLOADS_PATH);
  mediaCache = organizeMedia(rawMedia);
  lastScan = now;
  console.log(`Found ${mediaCache.stats.totalTvShows} TV shows, ${mediaCache.stats.totalMovies} movies, ${mediaCache.stats.totalEpisodes} episodes`);
  
  // Trigger background thumbnail generation
  const allPaths = [
    ...rawMedia.filter(m => m.type === 'movie').map(m => m.path),
    ...rawMedia.filter(m => m.type === 'episode').slice(0, 50).map(m => m.path) // Limit episodes for performance
  ];
  preGenerateThumbnails(allPaths, DOWNLOADS_PATH).catch(err => {
    console.error('[Thumbnails] Background generation error:', err);
  });
  
  return mediaCache;
}

// API Routes

/**
 * GET /api/media - Get entire media library
 */
app.get('/api/media', (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    const library = getMediaLibrary(refresh);
    res.json(library);
  } catch (err) {
    console.error('Error getting media library:', err);
    res.status(500).json({ error: 'Failed to scan media library' });
  }
});

/**
 * GET /api/tv - Get TV shows only
 */
app.get('/api/tv', (req, res) => {
  try {
    const library = getMediaLibrary();
    res.json(library.tvShows);
  } catch (err) {
    console.error('Error getting TV shows:', err);
    res.status(500).json({ error: 'Failed to get TV shows' });
  }
});

/**
 * GET /api/movies - Get movies only
 */
app.get('/api/movies', (req, res) => {
  try {
    const library = getMediaLibrary();
    res.json(library.movies);
  } catch (err) {
    console.error('Error getting movies:', err);
    res.status(500).json({ error: 'Failed to get movies' });
  }
});

/**
 * GET /api/tv/:id - Get specific TV show details
 */
app.get('/api/tv/:id', (req, res) => {
  try {
    const library = getMediaLibrary();
    const show = library.tvShows.find(s => s.id === req.params.id);
    
    if (!show) {
      return res.status(404).json({ error: 'TV show not found' });
    }
    
    res.json(show);
  } catch (err) {
    console.error('Error getting TV show:', err);
    res.status(500).json({ error: 'Failed to get TV show' });
  }
});

/**
 * GET /api/movies/:id - Get specific movie details
 */
app.get('/api/movies/:id', (req, res) => {
  try {
    const library = getMediaLibrary();
    const movie = library.movies.find(m => m.id === req.params.id);
    
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    res.json(movie);
  } catch (err) {
    console.error('Error getting movie:', err);
    res.status(500).json({ error: 'Failed to get movie' });
  }
});

/**
 * GET /api/search - Search media library
 */
app.get('/api/search', (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase();
    
    if (!query) {
      return res.json({ tvShows: [], movies: [] });
    }
    
    const library = getMediaLibrary();
    
    const tvShows = library.tvShows.filter(show => 
      show.title.toLowerCase().includes(query)
    );
    
    const movies = library.movies.filter(movie => 
      movie.title.toLowerCase().includes(query)
    );
    
    res.json({ tvShows, movies });
  } catch (err) {
    console.error('Error searching:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/continue-watching - Get the most recent unfinished video
 */
app.get('/api/continue-watching', (req, res) => {
  try {
    const item = getContinueWatching();
    res.json(item);
  } catch (err) {
    console.error('Error getting continue watching:', err);
    res.status(500).json({ error: 'Failed to get continue watching' });
  }
});

/**
 * GET /api/watch-history - Get all watch history (with availability info)
 */
app.get('/api/watch-history', (req, res) => {
  try {
    const items = getAllHistory();

    // Build a set of all current media paths from the library
    const library = getMediaLibrary();
    const availablePaths = new Set();

    if (library) {
      if (Array.isArray(library.movies)) {
        for (const movie of library.movies) {
          if (movie.path) availablePaths.add(movie.path);
        }
      }

      if (Array.isArray(library.tvShows)) {
        for (const show of library.tvShows) {
          if (!show.seasons) continue;
          for (const season of show.seasons) {
            if (!season.episodes) continue;
            for (const episode of season.episodes) {
              if (episode.path) availablePaths.add(episode.path);
            }
          }
        }
      }
    }

    // Attach availability flag to each history entry
    const withAvailability = items.map(item => ({
      ...item,
      available: availablePaths.has(item.path)
    }));

    res.json(withAvailability);
  } catch (err) {
    console.error('Error getting watch history:', err);
    res.status(500).json({ error: 'Failed to get watch history' });
  }
});

/**
 * GET /api/watch-progress/* - Get progress for a specific video
 */
app.get('/api/watch-progress/*', (req, res) => {
  try {
    const videoPath = req.params[0];
    const progress = getProgress(videoPath);
    res.json(progress);
  } catch (err) {
    console.error('Error getting watch progress:', err);
    res.status(500).json({ error: 'Failed to get watch progress' });
  }
});

/**
 * POST /api/watch-progress - Save watch progress
 */
app.post('/api/watch-progress', (req, res) => {
  try {
    const { path: videoPath, title, type, showId, showTitle, season, episode, currentTime, duration } = req.body;
    
    if (!videoPath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    const entry = updateProgress({
      path: videoPath,
      title,
      type,
      showId,
      showTitle,
      season,
      episode,
      currentTime,
      duration
    });
    
    res.json(entry);
  } catch (err) {
    console.error('Error saving watch progress:', err);
    res.status(500).json({ error: 'Failed to save watch progress' });
  }
});

/**
 * GET /api/thumbnail/* - Get thumbnail for a video file
 * Generates on-demand and caches for performance
 */
app.get('/api/thumbnail/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const filePath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Generate or get cached thumbnail
    const thumbnailPath = await generateThumbnail(filePath);
    
    // Set cache headers (cache for 1 week)
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Type', 'image/jpeg');
    
    // Stream the thumbnail
    const stream = fs.createReadStream(thumbnailPath);
    stream.pipe(res);
    
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    // Return a 1x1 transparent pixel as fallback
    res.status(200).setHeader('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  }
});

/**
 * GET /api/poster/:type/:title - Get poster image URL from TMDB
 * Returns JSON with posterUrl (or null if not found)
 */
app.get('/api/poster/:type/:title', async (req, res) => {
  try {
    const { type, title } = req.params;
    const year = req.query.year ? parseInt(req.query.year) : null;
    
    if (!isTmdbConfigured()) {
      return res.json({ posterUrl: null, configured: false });
    }
    
    let metadata;
    if (type === 'movie') {
      metadata = await getMovieMetadata(decodeURIComponent(title), year);
    } else if (type === 'tv') {
      metadata = await getTvMetadata(decodeURIComponent(title));
    } else {
      return res.status(400).json({ error: 'Invalid type. Use "movie" or "tv"' });
    }
    
    res.json({
      posterUrl: metadata?.posterPath || null,
      backdropUrl: metadata?.backdropPath || null,
      configured: true
    });
  } catch (err) {
    console.error('Error fetching poster:', err);
    res.json({ posterUrl: null, configured: true });
  }
});

/**
 * GET /api/tv-details/:title - Get detailed TV show metadata from TMDB
 */
app.get('/api/tv-details/:title', async (req, res) => {
  try {
    const { title } = req.params;
    
    if (!isTmdbConfigured()) {
      return res.json({ configured: false });
    }
    
    const details = await getTvShowDetails(decodeURIComponent(title));
    
    res.json({
      ...details,
      configured: true
    });
  } catch (err) {
    console.error('Error fetching TV details:', err);
    res.json({ configured: true, error: err.message });
  }
});

/**
 * GET /api/season-episodes/:title/:season - Get episode details for a season from TMDB
 */
app.get('/api/season-episodes/:title/:season', async (req, res) => {
  try {
    const { title, season } = req.params;
    
    if (!isTmdbConfigured()) {
      return res.json({ configured: false });
    }
    
    const seasonDetails = await getSeasonEpisodes(decodeURIComponent(title), parseInt(season));
    
    res.json({
      ...seasonDetails,
      configured: true
    });
  } catch (err) {
    console.error('Error fetching season episodes:', err);
    res.json({ configured: true, error: err.message });
  }
});

/**
 * GET /api/stream/* - Stream a video file with range support
 */
app.get('/api/stream/*', (req, res) => {
  try {
    const relativePath = req.params[0];
    const filePath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security: ensure path doesn't escape downloads directory
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const mimeType = mime.lookup(filePath) || 'video/mp4';
    const range = req.headers.range;
    
    if (range) {
      // Range request for video seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      
      const file = fs.createReadStream(filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType
      });
      
      file.pipe(res);
    } else {
      // Full file request
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType
      });
      
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('Error streaming file:', err);
    res.status(500).json({ error: 'Streaming failed' });
  }
});

/**
 * GET /api/auto-subtitle/* - Auto-fetch subtitles if not available
 * This endpoint checks for existing subtitles, and downloads from OpenSubtitles if missing
 */
app.get('/api/auto-subtitle/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const videoPath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(videoPath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Get time offset for transcoded videos (when seeking)
    const offsetSeconds = req.query.offset ? parseFloat(req.query.offset) : 0;
    
    // Get or download subtitles
    const result = await getSubtitles(videoPath, 'en');
    
    if (!result.path) {
      return res.status(404).json({ 
        error: result.error || 'No subtitles found',
        configured: isSubtitlesConfigured()
      });
    }
    
    // Read and convert to VTT with time offset
    const ext = path.extname(result.path).toLowerCase();
    const content = fs.readFileSync(result.path, 'utf-8');
    
    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('X-Subtitle-Source', result.source);
    if (result.match) {
      res.setHeader('X-Subtitle-Match', result.match);
    }
    if (offsetSeconds > 0) {
      res.setHeader('X-Subtitle-Offset', offsetSeconds.toString());
      console.log(`[Subtitles] Applying offset: ${offsetSeconds}s`);
    }
    
    if (ext === '.srt') {
      res.send(convertSrtToVtt(content, offsetSeconds));
    } else {
      // For VTT files, we also need to adjust if there's an offset
      if (offsetSeconds > 0) {
        res.send(convertSrtToVtt(content, offsetSeconds));
      } else {
        res.send(content);
      }
    }
  } catch (err) {
    console.error('Error auto-fetching subtitle:', err);
    res.status(500).json({ error: 'Failed to fetch subtitle' });
  }
});

/**
 * POST /api/upload-subtitle/* - Upload a subtitle file for a video
 * Accepts SRT or VTT file as text body
 */
app.post('/api/upload-subtitle/*', (req, res) => {
  try {
    const relativePath = req.params[0];
    const videoPath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(videoPath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get subtitle content from body
    let subtitleContent = '';
    if (typeof req.body === 'string') {
      subtitleContent = req.body;
    } else if (req.body && req.body.content) {
      subtitleContent = req.body.content;
    }
    
    if (!subtitleContent || subtitleContent.length < 10) {
      return res.status(400).json({ error: 'No subtitle content provided' });
    }
    
    // Save subtitle next to video file
    const subtitlePath = videoPath.replace(/\.[^/.]+$/, '.srt');
    fs.writeFileSync(subtitlePath, subtitleContent, 'utf-8');
    
    console.log(`[Subtitles] Uploaded subtitle saved to: ${subtitlePath}`);
    res.json({ 
      success: true, 
      message: 'Subtitle uploaded successfully',
      path: subtitlePath 
    });
  } catch (err) {
    console.error('Error uploading subtitle:', err);
    res.status(500).json({ error: 'Failed to upload subtitle' });
  }
});

/**
 * GET /api/subtitle/* - Serve subtitle file
 */
app.get('/api/subtitle/*', (req, res) => {
  try {
    const relativePath = req.params[0];
    const filePath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Subtitle not found' });
    }
    
    // Convert SRT to VTT for browser compatibility
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.srt') {
      const srtContent = fs.readFileSync(filePath, 'utf-8');
      const vttContent = convertSrtToVtt(srtContent);
      res.setHeader('Content-Type', 'text/vtt');
      res.send(vttContent);
    } else {
      res.setHeader('Content-Type', 'text/vtt');
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('Error serving subtitle:', err);
    res.status(500).json({ error: 'Failed to serve subtitle' });
  }
});

/**
 * Parse VTT timestamp to seconds
 */
function parseVttTime(timeStr) {
  const parts = timeStr.split(':');
  const seconds = parseFloat(parts[2]);
  const minutes = parseInt(parts[1]);
  const hours = parseInt(parts[0]);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds to VTT timestamp
 */
function formatVttTime(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toFixed(3);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.padStart(6, '0')}`;
}

/**
 * Convert SRT subtitle format to WebVTT, optionally adjusting timestamps
 */
function convertSrtToVtt(srtContent, offsetSeconds = 0) {
  // Normalize line endings and convert comma to period in timestamps
  let content = srtContent
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  // Split into cues (separated by blank lines)
  const cueBlocks = content.split(/\n\n+/).filter(block => block.trim());
  const processedCues = [];
  
  for (const block of cueBlocks) {
    const lines = block.split('\n');
    
    // Find the timestamp line
    let timestampLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timestampLineIdx = i;
        break;
      }
    }
    
    if (timestampLineIdx === -1) continue;
    
    // Parse timestamp
    const timestampMatch = lines[timestampLineIdx].match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!timestampMatch) continue;
    
    const startTime = parseVttTime(timestampMatch[1]);
    const endTime = parseVttTime(timestampMatch[2]);
    
    // Apply offset
    const newStart = startTime - offsetSeconds;
    const newEnd = endTime - offsetSeconds;
    
    // Skip cues that end before 0 (entirely before offset)
    if (newEnd <= 0) continue;
    
    // Get the text content (everything after timestamp line)
    const textLines = lines.slice(timestampLineIdx + 1);
    
    // Build the adjusted cue
    processedCues.push(
      `${formatVttTime(Math.max(0, newStart))} --> ${formatVttTime(newEnd)}\n${textLines.join('\n')}`
    );
  }
  
  // Build final VTT
  return 'WEBVTT\n\n' + processedCues.join('\n\n');
}

// ============================================
// EPISODE MARKERS (Skip Intro, Next Episode)
// ============================================

/**
 * GET /api/episode-markers/* - Get intro/outro markers for a video
 */
app.get('/api/episode-markers/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const videoPath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(videoPath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const markers = await getEpisodeMarkers(videoPath);
    res.json(markers);
  } catch (err) {
    console.error('Error getting episode markers:', err);
    res.status(500).json({ error: 'Failed to get episode markers' });
  }
});

/**
 * POST /api/episode-markers/* - Save user-contributed marker
 * Body: { markerType: 'introEnd' | 'outroStart', time: number }
 */
app.post('/api/episode-markers/*', (req, res) => {
  try {
    const relativePath = req.params[0];
    const videoPath = path.join(DOWNLOADS_PATH, relativePath);
    const { markerType, time } = req.body;
    
    // Security check
    const resolvedPath = path.resolve(videoPath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!['introStart', 'introEnd', 'outroStart', 'creditsStart'].includes(markerType)) {
      return res.status(400).json({ error: 'Invalid marker type' });
    }
    
    if (typeof time !== 'number' || time < 0) {
      return res.status(400).json({ error: 'Invalid time value' });
    }
    
    const result = saveEpisodeMarker(videoPath, markerType, time);
    res.json({ success: true, markers: result });
  } catch (err) {
    console.error('Error saving episode marker:', err);
    res.status(500).json({ error: 'Failed to save marker' });
  }
});

/**
 * GET /api/next-episode/* - Get next episode for current video
 */
app.get('/api/next-episode/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const currentPath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(currentPath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get all shows to find next episode
    const files = await scanDirectory(DOWNLOADS_PATH);
    const organized = organizeMedia(files);
    
    const nextEp = getNextEpisode(organized.tvShows, relativePath);
    
    if (nextEp) {
      res.json({ hasNext: true, episode: nextEp });
    } else {
      res.json({ hasNext: false });
    }
  } catch (err) {
    console.error('Error getting next episode:', err);
    res.status(500).json({ error: 'Failed to get next episode' });
  }
});

// Cache for media info probes
const mediaInfoCache = new Map();
const MEDIA_INFO_CACHE_DURATION = 3600000; // 1 hour

/**
 * GET /api/media-info/* - Get codec information for a video file
 */
app.get('/api/media-info/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const filePath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check cache first
    const cached = mediaInfoCache.get(relativePath);
    if (cached && Date.now() - cached.timestamp < MEDIA_INFO_CACHE_DURATION) {
      return res.json(cached.info);
    }
    
    // Probe the file
    const info = await probeMedia(filePath);
    info.path = relativePath;
    
    // Cache the result
    mediaInfoCache.set(relativePath, {
      info,
      timestamp: Date.now()
    });
    
    res.json(info);
  } catch (err) {
    console.error('Error probing media:', err);
    
    // Fallback: assume transcoding needed based on filename
    const relativePath = req.params[0];
    res.json({
      path: relativePath,
      needsTranscode: likelyNeedsTranscode(relativePath),
      reason: 'Could not probe file, using filename heuristics',
      error: err.message
    });
  }
});

/**
 * GET /api/transcode/* - Stream transcoded video
 */
app.get('/api/transcode/*', async (req, res) => {
  try {
    const relativePath = req.params[0];
    const filePath = path.join(DOWNLOADS_PATH, relativePath);
    
    // Security check
    const resolvedPath = path.resolve(filePath);
    const resolvedDownloads = path.resolve(DOWNLOADS_PATH);
    
    if (!resolvedPath.startsWith(resolvedDownloads)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get options from query params
    const startTime = req.query.t ? parseFloat(req.query.t) : null;
    const upscale4k = req.query.upscale === '4k';
    
    console.log(`[Transcode] Starting transcode for: ${relativePath}${upscale4k ? ' (4K upscale)' : ''}`);
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Create transcode stream
    const ffmpeg = createTranscodeStream(filePath, {
      startTime,
      upscale4k,
      preset: upscale4k ? 'faster' : 'fast', // Use faster preset for 4K to reduce CPU load
      crf: upscale4k ? 20 : 23 // Slightly better quality for 4K
    });
    
    // Pipe FFmpeg output to response
    ffmpeg.stdout.pipe(res);
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`[Transcode] Client disconnected, killing FFmpeg`);
      ffmpeg.kill('SIGTERM');
    });
    
    // Handle FFmpeg errors
    ffmpeg.on('error', (err) => {
      console.error(`[Transcode] FFmpeg error:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Transcoding failed' });
      }
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.log(`[Transcode] FFmpeg exited with code ${code}`);
      } else {
        console.log(`[Transcode] Completed: ${relativePath}`);
      }
    });
    
  } catch (err) {
    console.error('Error transcoding:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Transcoding failed' });
    }
  }
});

// Serve static frontend files in production
// Check multiple possible paths for the built frontend
const possibleClientPaths = [
  path.join(__dirname, 'client/dist'),      // Docker: /app/client/dist
  path.join(__dirname, '../client/dist'),   // Dev: relative to server/
];

const clientBuildPath = possibleClientPaths.find(p => fs.existsSync(p));
if (clientBuildPath) {
  console.log(`Serving static files from: ${clientBuildPath}`);
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Media Browser API running on http://0.0.0.0:${PORT}`);
  console.log(`Downloads path: ${DOWNLOADS_PATH}`);
  
  // Initial scan
  getMediaLibrary();
});

module.exports = app;
