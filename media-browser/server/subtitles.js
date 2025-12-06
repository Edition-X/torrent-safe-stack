const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');

// OpenSubtitles API configuration
const OPENSUBTITLES_API = 'https://api.opensubtitles.com/api/v1';
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || '';
const OPENSUBTITLES_USER = process.env.OPENSUBTITLES_USER || '';
const OPENSUBTITLES_PASS = process.env.OPENSUBTITLES_PASS || '';

// SubDB API (fallback - hash-based, no API key required)
const SUBDB_API = 'http://api.thesubdb.com';

// Podnapisi API (second fallback - HTTPS, no API key)
const PODNAPISI_API = 'https://www.podnapisi.net/subtitles/search/old';

// Subtitle cache directory
const SUBTITLE_CACHE_DIR = process.env.SUBTITLE_CACHE_PATH || '/tmp/danflix-subtitles';

// Ensure cache directory exists
if (!fs.existsSync(SUBTITLE_CACHE_DIR)) {
  fs.mkdirSync(SUBTITLE_CACHE_DIR, { recursive: true });
}

// In-memory token cache
let authToken = null;
let tokenExpiry = null;

/**
 * Check if OpenSubtitles is configured
 */
function isConfigured() {
  return !!OPENSUBTITLES_API_KEY;
}

/**
 * Make HTTP request with redirect handling
 */
function makeRequest(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'));
    }
    
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': OPENSUBTITLES_API_KEY,
        'User-Agent': 'DanFlix v1.0',
        ...options.headers
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, url).toString();
        console.log(`[Subtitles] Following redirect to: ${redirectUrl}`);
        return resolve(makeRequest(redirectUrl, options, redirectCount + 1));
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * Authenticate with OpenSubtitles (if credentials provided)
 */
async function authenticate() {
  if (!OPENSUBTITLES_USER || !OPENSUBTITLES_PASS) {
    return null;
  }
  
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken;
  }
  
  try {
    const response = await makeRequest(`${OPENSUBTITLES_API}/login`, {
      method: 'POST',
      body: {
        username: OPENSUBTITLES_USER,
        password: OPENSUBTITLES_PASS
      }
    });
    
    if (response.status === 200 && response.data.token) {
      authToken = response.data.token;
      tokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      return authToken;
    }
  } catch (err) {
    console.error('[Subtitles] Auth error:', err.message);
  }
  
  return null;
}

/**
 * Calculate OpenSubtitles hash for a video file
 */
function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const HASH_CHUNK_SIZE = 65536; // 64KB
    
    fs.stat(filePath, (err, stat) => {
      if (err) return reject(err);
      
      const fileSize = stat.size;
      let hash = BigInt(fileSize);
      
      const readChunk = (start, length) => {
        return new Promise((res, rej) => {
          const buffer = Buffer.alloc(length);
          const fd = fs.openSync(filePath, 'r');
          fs.read(fd, buffer, 0, length, start, (err, bytesRead) => {
            fs.closeSync(fd);
            if (err) return rej(err);
            res(buffer.slice(0, bytesRead));
          });
        });
      };
      
      Promise.all([
        readChunk(0, HASH_CHUNK_SIZE),
        readChunk(Math.max(0, fileSize - HASH_CHUNK_SIZE), HASH_CHUNK_SIZE)
      ]).then(([head, tail]) => {
        const combined = Buffer.concat([head, tail]);
        for (let i = 0; i < combined.length; i += 8) {
          const low = combined.readUInt32LE(i);
          const high = combined.readUInt32LE(i + 4);
          hash += BigInt(low) + (BigInt(high) << 32n);
          hash = hash & 0xFFFFFFFFFFFFFFFFn; // Keep 64 bits
        }
        resolve(hash.toString(16).padStart(16, '0'));
      }).catch(reject);
    });
  });
}

/**
 * Clean title for subtitle search
 */
function cleanTitle(filename) {
  return filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/\[.*?\]/g, '') // Remove [tags]
    .replace(/\(.*?\)/g, '') // Remove (tags)
    .replace(/\./g, ' ') // Replace dots with spaces
    .replace(/[_-]/g, ' ') // Replace underscores/hyphens
    .replace(/\b(720p|1080p|2160p|4K|HDR|WEB|BluRay|HEVC|x265|x264|AAC|DTS|PROPER|REPACK)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract season and episode from filename
 */
function extractEpisodeInfo(filename) {
  const match = filename.match(/S(\d{1,2})E(\d{1,2})/i);
  if (match) {
    return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  }
  return null;
}

/**
 * Search for subtitles on OpenSubtitles
 */
async function searchSubtitles(filePath, language = 'en') {
  if (!isConfigured()) {
    console.log('[Subtitles] OpenSubtitles not configured');
    return [];
  }

  const filename = path.basename(filePath);
  const cleanedTitle = cleanTitle(filename);
  const episodeInfo = extractEpisodeInfo(filename);
  
  console.log(`[Subtitles] Searching for: "${cleanedTitle}"${episodeInfo ? ` S${episodeInfo.season}E${episodeInfo.episode}` : ''}`);

  try {
    // Try hash-based search first (most accurate)
    let hash;
    try {
      hash = await calculateHash(filePath);
      console.log(`[Subtitles] File hash: ${hash}`);
    } catch (err) {
      console.log('[Subtitles] Could not calculate hash:', err.message);
    }

    const searchParams = new URLSearchParams({
      languages: language,
      ...(hash && { moviehash: hash }),
      query: cleanedTitle
    });

    if (episodeInfo) {
      searchParams.set('season_number', episodeInfo.season);
      searchParams.set('episode_number', episodeInfo.episode);
    }

    const token = await authenticate();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await makeRequest(
      `${OPENSUBTITLES_API}/subtitles?${searchParams.toString()}`,
      { headers }
    );

    console.log(`[Subtitles] API response status: ${response.status}`);
    
    if (response.status === 200 && response.data.data) {
      console.log(`[Subtitles] Raw results: ${response.data.data.length}`);
      
      const subtitles = response.data.data
        .filter(sub => sub.attributes.language === language)
        .sort((a, b) => {
          // Prefer hash matches
          if (a.attributes.moviehash_match !== b.attributes.moviehash_match) {
            return b.attributes.moviehash_match ? 1 : -1;
          }
          // Then by download count
          return (b.attributes.download_count || 0) - (a.attributes.download_count || 0);
        })
        .slice(0, 5);

      console.log(`[Subtitles] Found ${subtitles.length} results after filtering`);
      
      // If no results with language filter, try a simpler search
      if (subtitles.length === 0 && response.data.data.length > 0) {
        console.log(`[Subtitles] Had ${response.data.data.length} results but none matched language ${language}`);
        // Return first English-ish result
        const englishSubs = response.data.data.filter(sub => 
          sub.attributes.language === 'en' || sub.attributes.language === 'eng'
        );
        if (englishSubs.length > 0) {
          return englishSubs.slice(0, 5);
        }
      }
      
      return subtitles;
    }
    
    // Log error responses
    if (response.status !== 200) {
      console.log(`[Subtitles] API error: ${JSON.stringify(response.data)}`);
    }
    
    return [];
  } catch (err) {
    console.error('[Subtitles] Search error:', err.message);
    return [];
  }
}

/**
 * Sleep helper for retries
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download a subtitle file with retry logic
 */
async function downloadSubtitle(fileId, destPath, retries = 3) {
  if (!isConfigured()) {
    throw new Error('OpenSubtitles not configured');
  }

  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const token = await authenticate();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Get download link
      console.log(`[Subtitles] Requesting download for file_id: ${fileId} (attempt ${attempt}/${retries})`);
      const response = await makeRequest(`${OPENSUBTITLES_API}/download`, {
        method: 'POST',
        headers,
        body: { file_id: fileId }
      });

      console.log(`[Subtitles] Download API response: ${response.status}`);

      // Handle 503 with retry
      if (response.status === 503) {
        console.log(`[Subtitles] Service temporarily unavailable, waiting before retry...`);
        if (attempt < retries) {
          await sleep(2000 * attempt); // Exponential backoff: 2s, 4s, 6s
          continue;
        }
        throw new Error(`Service unavailable after ${retries} attempts`);
      }

      if (response.status !== 200 || !response.data.link) {
        throw new Error(`Failed to get download link: ${response.status}`);
      }

      // Download the subtitle file
      const downloadUrl = response.data.link;
      
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(downloadUrl, (res) => {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log(`[Subtitles] Downloaded to ${destPath}`);
            resolve(destPath);
          });
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });
    } catch (err) {
      lastError = err;
      console.error(`[Subtitles] Download attempt ${attempt} failed:`, err.message);
      if (attempt < retries) {
        await sleep(2000 * attempt);
      }
    }
  }
  
  throw lastError;
}

// ============================================
// SUBDB API (Fallback Service - Hash-based)
// ============================================

/**
 * Calculate SubDB hash (first and last 64KB of file)
 */
async function calculateSubDbHash(filePath) {
  return new Promise((resolve, reject) => {
    const HASH_SIZE = 64 * 1024; // 64KB
    
    fs.stat(filePath, (err, stats) => {
      if (err) return reject(err);
      
      if (stats.size < HASH_SIZE * 2) {
        return reject(new Error('File too small for SubDB hash'));
      }
      
      const hash = crypto.createHash('md5');
      const buffer = Buffer.alloc(HASH_SIZE * 2);
      
      fs.open(filePath, 'r', (err, fd) => {
        if (err) return reject(err);
        
        // Read first 64KB
        fs.read(fd, buffer, 0, HASH_SIZE, 0, (err) => {
          if (err) { fs.close(fd, () => {}); return reject(err); }
          
          // Read last 64KB
          fs.read(fd, buffer, HASH_SIZE, HASH_SIZE, stats.size - HASH_SIZE, (err) => {
            fs.close(fd, () => {});
            if (err) return reject(err);
            
            hash.update(buffer);
            resolve(hash.digest('hex'));
          });
        });
      });
    });
  });
}

/**
 * Search SubDB for subtitles by file hash
 */
async function searchSubDb(hash, language = 'en') {
  console.log(`[SubDB] Searching with hash: ${hash}`);
  
  return new Promise((resolve) => {
    const url = `${SUBDB_API}/?action=search&hash=${hash}`;
    
    const req = http.get(url, {
      headers: {
        'User-Agent': 'SubDB/1.0 (DanFlix/1.0; http://github.com/user/danflix)'
      },
      timeout: 5000 // 5 second timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 && data) {
          // Response is comma-separated list of languages
          const languages = data.split(',');
          console.log(`[SubDB] Available languages: ${languages.join(', ')}`);
          
          // Check if requested language is available
          const hasLanguage = languages.some(l => 
            l.toLowerCase() === language || 
            l.toLowerCase() === 'en' ||
            l.toLowerCase() === 'english'
          );
          
          resolve(hasLanguage ? languages : []);
        } else if (res.statusCode === 404) {
          console.log('[SubDB] No subtitles found for this hash');
          resolve([]);
        } else {
          console.log(`[SubDB] Search returned status ${res.statusCode}`);
          resolve([]);
        }
      });
    });
    
    req.on('timeout', () => {
      console.log('[SubDB] Request timed out');
      req.destroy();
      resolve([]);
    });
    
    req.on('error', (err) => {
      console.error('[SubDB] Search error:', err.message);
      resolve([]);
    });
  });
}

/**
 * Download subtitle from SubDB
 */
async function downloadFromSubDb(hash, language, destPath) {
  console.log(`[SubDB] Downloading ${language} subtitle for hash: ${hash}`);
  
  return new Promise((resolve, reject) => {
    const url = `${SUBDB_API}/?action=download&hash=${hash}&language=${language}`;
    
    const req = http.get(url, {
      headers: {
        'User-Agent': 'SubDB/1.0 (DanFlix/1.0; http://github.com/user/danflix)'
      },
      timeout: 10000 // 10 second timeout
    }, (res) => {
      if (res.statusCode === 200) {
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`[SubDB] Downloaded to ${destPath}`);
          resolve(destPath);
        });
      } else {
        reject(new Error(`SubDB download failed with status ${res.statusCode}`));
      }
    });
    
    req.on('timeout', () => {
      console.log('[SubDB] Download timed out');
      req.destroy();
      reject(new Error('SubDB download timed out'));
    });
    
    req.on('error', reject);
  });
}

/**
 * Try to get subtitles from SubDB (fallback service)
 */
async function getSubtitlesFromSubDb(videoPath, language = 'en') {
  console.log(`[SubDB] Trying SubDB for: ${path.basename(videoPath)}`);
  
  try {
    // Calculate SubDB hash
    const hash = await calculateSubDbHash(videoPath);
    console.log(`[SubDB] File hash: ${hash}`);
    
    // Search for available subtitles
    const available = await searchSubDb(hash, language);
    
    if (available.length === 0) {
      return { path: null, source: null, error: 'No subtitles found on SubDB' };
    }
    
    // Download to cache
    const cacheFileName = crypto.createHash('md5')
      .update(path.basename(videoPath))
      .digest('hex') + '.srt';
    const cachePath = path.join(SUBTITLE_CACHE_DIR, cacheFileName);
    
    // Check if already in cache
    if (fs.existsSync(cachePath)) {
      console.log(`[SubDB] Using cached: ${cachePath}`);
      return { path: cachePath, source: 'cached' };
    }
    
    // Try English first, then 'en'
    const langToDownload = available.includes('english') ? 'english' : 
                           available.includes('en') ? 'en' : 
                           available[0];
    
    await downloadFromSubDb(hash, langToDownload, cachePath);
    
    return { path: cachePath, source: 'subdb', match: 'hash' };
  } catch (err) {
    return { path: null, source: null, error: `SubDB error: ${err.message}` };
  }
}

// ============================================
// PODNAPISI API (Third Fallback - HTTPS)
// ============================================

/**
 * Search Podnapisi for subtitles using wget (more VPN-friendly)
 */
async function searchPodnapisi(title, season = null, episode = null, language = 'en') {
  console.log(`[Podnapisi] Searching for: ${title} S${season}E${episode}`);
  
  return new Promise((resolve) => {
    // Build search URL - use the working format
    let searchUrl = `https://www.podnapisi.net/subtitles/search/?keywords=${encodeURIComponent(title)}&language=${language}`;
    if (season) searchUrl += `&seasons=${season}`;
    if (episode) searchUrl += `&episodes=${episode}`;
    
    // Use wget which often works better through VPN
    const wget = spawn('wget', [
      '-q', '-O', '-',
      '--timeout=15',
      '--user-agent=Mozilla/5.0',
      searchUrl
    ]);
    
    let output = '';
    let error = '';
    
    wget.stdout.on('data', (data) => output += data.toString());
    wget.stderr.on('data', (data) => error += data.toString());
    
    wget.on('close', (code) => {
      if (code !== 0 || !output) {
        console.log(`[Podnapisi] wget failed: ${error || 'no output'}`);
        resolve([]);
        return;
      }
      
      // Parse HTML to find download links
      // Pattern: /subtitles/en-show-name-year-SXXEXX-O/XXXX/download
      const downloadMatches = output.match(/href="(\/subtitles\/[^"]+\/download)"/g) || [];
      const downloadUrls = downloadMatches.map(m => {
        const match = m.match(/href="([^"]+)"/);
        return match ? match[1] : null;
      }).filter(Boolean);
      
      console.log(`[Podnapisi] Found ${downloadUrls.length} download URLs`);
      
      // Return as array of objects with download URL
      resolve(downloadUrls.slice(0, 5).map(url => ({ downloadUrl: url })));
    });
    
    // Timeout
    setTimeout(() => {
      wget.kill();
      console.log('[Podnapisi] wget timed out');
      resolve([]);
    }, 20000);
  });
}

/**
 * Download subtitle from Podnapisi using wget
 */
async function downloadFromPodnapisi(downloadPath, destPath) {
  const downloadUrl = `https://www.podnapisi.net${downloadPath}`;
  console.log(`[Podnapisi] Downloading from: ${downloadUrl}`);
  
  return new Promise((resolve, reject) => {
    // Use wget with redirect following
    const wget = spawn('wget', [
      '-q', '-O', destPath,
      '--timeout=20',
      '--user-agent=Mozilla/5.0',
      '--content-disposition',
      downloadUrl
    ]);
    
    let error = '';
    wget.stderr.on('data', (data) => error += data.toString());
    
    wget.on('close', (code) => {
      if (code === 0 && fs.existsSync(destPath)) {
        const stats = fs.statSync(destPath);
        if (stats.size > 0) {
          console.log(`[Podnapisi] Downloaded to ${destPath} (${stats.size} bytes)`);
          resolve(destPath);
        } else {
          fs.unlinkSync(destPath);
          reject(new Error('Downloaded file is empty'));
        }
      } else {
        reject(new Error(`wget failed: ${error || 'unknown error'}`));
      }
    });
    
    // Timeout
    setTimeout(() => {
      wget.kill();
      reject(new Error('Download timed out'));
    }, 30000);
  });
}

/**
 * Extract show/movie title from filename for Podnapisi search
 */
function extractTitleForPodnapisi(filename) {
  // Remove extension
  let title = filename.replace(/\.[^/.]+$/, '');
  
  // Remove season/episode info and everything after
  title = title.replace(/[Ss]\d{1,2}[Ee]\d{1,2}.*/i, '');
  
  // Replace dots, underscores with spaces
  title = title.replace(/[._]/g, ' ');
  
  // Remove year pattern
  title = title.replace(/\(?\d{4}\)?$/, '');
  
  // Remove quality/release info in brackets
  title = title.replace(/\[[^\]]*\]/g, '');
  
  // Clean up
  title = title.replace(/\s+/g, ' ').trim();
  
  return title;
}

/**
 * Try to get subtitles from Podnapisi
 */
async function getSubtitlesFromPodnapisi(videoPath, language = 'en') {
  const filename = path.basename(videoPath);
  console.log(`[Podnapisi] Trying Podnapisi for: ${filename}`);
  
  try {
    const title = extractTitleForPodnapisi(filename);
    const epInfo = extractEpisodeInfo(filename);
    
    console.log(`[Podnapisi] Parsed title: "${title}", episode: S${epInfo?.season}E${epInfo?.episode}`);
    
    // Search for subtitles
    const results = await searchPodnapisi(
      title,
      epInfo?.season || null,
      epInfo?.episode || null,
      language
    );
    
    if (!results || results.length === 0) {
      return { path: null, source: null, error: 'No subtitles found on Podnapisi' };
    }
    
    // Get the first result
    const best = results[0];
    const downloadUrl = best.downloadUrl;
    
    if (!downloadUrl) {
      return { path: null, source: null, error: 'No download URL in results' };
    }
    
    // Download to cache
    const cacheFileName = crypto.createHash('md5')
      .update(filename)
      .digest('hex') + '.srt';
    const cachePath = path.join(SUBTITLE_CACHE_DIR, cacheFileName);
    
    await downloadFromPodnapisi(downloadUrl, cachePath);
    
    return { path: cachePath, source: 'podnapisi', match: 'name' };
  } catch (err) {
    return { path: null, source: null, error: `Podnapisi error: ${err.message}` };
  }
}

/**
 * Extract embedded subtitles from video file using ffmpeg
 */
async function extractEmbeddedSubtitles(videoPath, destPath, language = 'en') {
  console.log(`[Subtitles] Checking for embedded subtitles in: ${path.basename(videoPath)}`);
  
  return new Promise((resolve) => {
    // First, probe the file to find subtitle streams
    const probe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 's',
      videoPath
    ]);
    
    let output = '';
    probe.stdout.on('data', (data) => output += data.toString());
    
    probe.on('close', async (code) => {
      if (code !== 0 || !output) {
        console.log('[Subtitles] No subtitle streams found');
        resolve({ path: null, source: null });
        return;
      }
      
      try {
        const data = JSON.parse(output);
        const streams = data.streams || [];
        
        if (streams.length === 0) {
          console.log('[Subtitles] No embedded subtitles');
          resolve({ path: null, source: null });
          return;
        }
        
        // Find best subtitle stream (prefer matching language, then first available)
        let bestStream = null;
        let bestIndex = 0;
        
        for (let i = 0; i < streams.length; i++) {
          const stream = streams[i];
          const lang = stream.tags?.language || '';
          const title = (stream.tags?.title || '').toLowerCase();
          
          // Skip forced/signs-only subtitles
          if (title.includes('forced') || title.includes('sign')) continue;
          
          // Prefer English subtitles
          if (lang === 'eng' || lang === 'en' || lang === language) {
            bestStream = stream;
            bestIndex = i;
            break;
          }
          
          // Fall back to first non-forced subtitle
          if (!bestStream) {
            bestStream = stream;
            bestIndex = i;
          }
        }
        
        if (!bestStream) {
          console.log('[Subtitles] No suitable subtitle stream found');
          resolve({ path: null, source: null });
          return;
        }
        
        const streamIndex = bestStream.index;
        const codecName = bestStream.codec_name;
        const lang = bestStream.tags?.language || 'unknown';
        const title = bestStream.tags?.title || '';
        
        console.log(`[Subtitles] Found embedded subtitle: stream ${streamIndex}, codec ${codecName}, lang ${lang}, title "${title}"`);
        
        // Extract the subtitle using ffmpeg
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', videoPath,
          '-map', `0:${streamIndex}`,
          '-c:s', 'srt',
          destPath
        ]);
        
        let ffmpegError = '';
        ffmpeg.stderr.on('data', (data) => ffmpegError += data.toString());
        
        ffmpeg.on('close', (code) => {
          if (code === 0 && fs.existsSync(destPath)) {
            const stats = fs.statSync(destPath);
            if (stats.size > 0) {
              console.log(`[Subtitles] Extracted embedded subtitle to ${destPath} (${stats.size} bytes)`);
              resolve({ 
                path: destPath, 
                source: 'embedded',
                language: lang,
                title: title
              });
              return;
            }
          }
          console.log(`[Subtitles] Failed to extract subtitle: ${ffmpegError.slice(-200)}`);
          resolve({ path: null, source: null });
        });
      } catch (err) {
        console.log(`[Subtitles] Error parsing ffprobe output: ${err.message}`);
        resolve({ path: null, source: null });
      }
    });
  });
}

/**
 * Check if subtitle exists for a video file
 */
function getExistingSubtitle(videoPath) {
  const basePath = videoPath.replace(/\.[^/.]+$/, '');
  const extensions = ['.srt', '.vtt', '.sub', '.ass'];
  
  for (const ext of extensions) {
    const subPath = basePath + ext;
    if (fs.existsSync(subPath)) {
      return subPath;
    }
    // Also check with .en suffix
    const enSubPath = basePath + '.en' + ext;
    if (fs.existsSync(enSubPath)) {
      return enSubPath;
    }
  }
  
  return null;
}

/**
 * Simple search by IMDB ID or show name for fallback
 */
async function searchByShowName(showName, season, episode, language = 'en') {
  try {
    const searchParams = new URLSearchParams({
      languages: language,
      query: showName,
      season_number: season,
      episode_number: episode
    });

    const token = await authenticate();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await makeRequest(
      `${OPENSUBTITLES_API}/subtitles?${searchParams.toString()}`,
      { headers }
    );

    if (response.status === 200 && response.data.data) {
      return response.data.data
        .filter(sub => sub.attributes.language === language || sub.attributes.language === 'eng')
        .slice(0, 5);
    }
    return [];
  } catch (err) {
    console.error('[Subtitles] Fallback search error:', err.message);
    return [];
  }
}

/**
 * Get or download subtitles for a video file
 * Tries OpenSubtitles first, then falls back to Subdl
 */
async function getSubtitles(videoPath, language = 'en') {
  // First check if subtitle already exists locally
  const existing = getExistingSubtitle(videoPath);
  if (existing) {
    console.log(`[Subtitles] Using existing: ${existing}`);
    return { path: existing, source: 'local' };
  }

  // Check cache first (regardless of which service downloaded it)
  const cacheFileName = crypto.createHash('md5')
    .update(path.basename(videoPath))
    .digest('hex') + '.srt';
  const cachePath = path.join(SUBTITLE_CACHE_DIR, cacheFileName);
  
  if (fs.existsSync(cachePath)) {
    console.log(`[Subtitles] Using cached: ${cachePath}`);
    return { path: cachePath, source: 'cached' };
  }

  // Try to extract embedded subtitles from the video file
  const embeddedResult = await extractEmbeddedSubtitles(videoPath, cachePath, language);
  if (embeddedResult.path) {
    return embeddedResult;
  }

  // Try OpenSubtitles first if configured
  if (isConfigured()) {
    try {
      console.log('[Subtitles] Trying OpenSubtitles...');
      let results = await searchSubtitles(videoPath, language);
      
      // If no results, try a simpler search
      if (results.length === 0) {
        const filename = path.basename(videoPath);
        const episodeInfo = extractEpisodeInfo(filename);
        
        if (episodeInfo) {
          const showName = filename.split(/[Ss]\d/)[0].replace(/\./g, ' ').trim();
          console.log(`[Subtitles] Fallback search: "${showName}" S${episodeInfo.season}E${episodeInfo.episode}`);
          results = await searchByShowName(showName, episodeInfo.season, episodeInfo.episode, language);
        }
      }
      
      if (results.length > 0) {
        const best = results[0];
        const fileId = best.attributes.files[0]?.file_id;
        
        if (fileId) {
          await downloadSubtitle(fileId, cachePath);
          return { 
            path: cachePath, 
            source: 'opensubtitles',
            match: best.attributes.moviehash_match ? 'hash' : 'name'
          };
        }
      }
    } catch (err) {
      console.log(`[Subtitles] OpenSubtitles failed: ${err.message}, trying SubDB...`);
    }
  }

  // Fallback 1: SubDB (hash-based)
  console.log('[Subtitles] Trying SubDB (fallback 1)...');
  const subdbResult = await getSubtitlesFromSubDb(videoPath, language);
  
  if (subdbResult.path) {
    return subdbResult;
  }

  // Fallback 2: Podnapisi (name-based, HTTPS - VPN friendly)
  console.log('[Subtitles] Trying Podnapisi (fallback 2)...');
  const podnapisiResult = await getSubtitlesFromPodnapisi(videoPath, language);
  
  if (podnapisiResult.path) {
    return podnapisiResult;
  }

  // No service worked
  return { 
    path: null, 
    source: null, 
    error: 'No subtitles found on OpenSubtitles, SubDB, or Podnapisi' 
  };
}

module.exports = {
  isConfigured,
  searchSubtitles,
  downloadSubtitle,
  getSubtitles,
  getExistingSubtitle
};
