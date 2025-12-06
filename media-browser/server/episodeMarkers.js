const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Storage for user-contributed markers
const DATA_DIR = process.env.DATA_PATH || '/data';
const MARKERS_FILE = path.join(DATA_DIR, 'episode-markers.json');

// Default heuristics for intro/outro detection
const DEFAULT_INTRO_START = 0;
const DEFAULT_INTRO_END = 90; // Assume intro ends within first 90 seconds
const DEFAULT_OUTRO_BEFORE_END = 120; // Assume outro starts 2 minutes before end

/**
 * Ensure data directory exists
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load markers from disk
 */
function loadMarkers() {
  ensureDataDir();
  try {
    if (fs.existsSync(MARKERS_FILE)) {
      return JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Markers] Error loading markers:', err);
  }
  return {};
}

/**
 * Save markers to disk
 */
function saveMarkers(markers) {
  ensureDataDir();
  try {
    fs.writeFileSync(MARKERS_FILE, JSON.stringify(markers, null, 2));
  } catch (err) {
    console.error('[Markers] Error saving markers:', err);
  }
}

/**
 * Get chapter markers from video file using ffprobe
 */
async function getChapterMarkers(videoPath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_chapters',
      '-show_format',
      videoPath
    ]);

    let output = '';
    let error = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      error += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0 || !output) {
        console.log('[Markers] ffprobe returned no chapters');
        resolve({ chapters: [], duration: 0 });
        return;
      }

      try {
        const data = JSON.parse(output);
        const duration = parseFloat(data.format?.duration) || 0;
        
        const chapters = (data.chapters || []).map(ch => ({
          id: ch.id,
          title: ch.tags?.title || `Chapter ${ch.id + 1}`,
          start: parseFloat(ch.start_time) || 0,
          end: parseFloat(ch.end_time) || 0
        }));

        console.log(`[Markers] Found ${chapters.length} chapters, duration: ${duration}s`);
        resolve({ chapters, duration });
      } catch (err) {
        console.error('[Markers] Error parsing ffprobe output:', err);
        resolve({ chapters: [], duration: 0 });
      }
    });
  });
}

/**
 * Detect intro/outro from chapter markers
 */
function detectFromChapters(chapters, duration) {
  const markers = {
    introStart: null,
    introEnd: null,
    outroStart: null,
    creditsStart: null
  };

  for (const ch of chapters) {
    const title = ch.title.toLowerCase();
    
    // Detect intro
    if (title.includes('intro') || title.includes('opening') || 
        title.includes('op') && ch.start < 300) {
      markers.introStart = ch.start;
      markers.introEnd = ch.end;
    }
    
    // Detect outro/credits
    if (title.includes('outro') || title.includes('ending') || 
        title.includes('ed') || title.includes('credit')) {
      markers.outroStart = ch.start;
      markers.creditsStart = ch.start;
    }

    // Some files mark "Episode" or "Main" as the content after intro
    if ((title.includes('episode') || title.includes('main') || 
         title.includes('content')) && ch.start > 0 && ch.start < 300) {
      markers.introEnd = ch.start;
      if (markers.introStart === null) {
        markers.introStart = 0;
      }
    }
  }

  return markers;
}

/**
 * Apply heuristics when no chapter data available
 */
function applyHeuristics(duration, episodeInfo) {
  // Short content (< 5 min) - no intro/outro
  if (duration < 300) {
    return {
      introStart: null,
      introEnd: null,
      outroStart: null,
      creditsStart: null,
      source: 'heuristic'
    };
  }

  // TV shows typically have intros
  const isLikelyTvShow = episodeInfo?.season && episodeInfo?.episode;
  
  return {
    introStart: 0,
    introEnd: isLikelyTvShow ? 60 : 30, // TV shows often have longer intros
    outroStart: Math.max(0, duration - DEFAULT_OUTRO_BEFORE_END),
    creditsStart: Math.max(0, duration - 90),
    source: 'heuristic'
  };
}

/**
 * Extract episode info from filename
 */
function extractEpisodeInfo(filename) {
  // Match S01E01 or 1x01 patterns
  const match = filename.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
  if (match) {
    return {
      season: parseInt(match[1], 10),
      episode: parseInt(match[2], 10)
    };
  }
  
  const altMatch = filename.match(/(\d{1,2})x(\d{1,2})/);
  if (altMatch) {
    return {
      season: parseInt(altMatch[1], 10),
      episode: parseInt(altMatch[2], 10)
    };
  }
  
  return null;
}

/**
 * Get episode markers (combines all sources)
 */
async function getEpisodeMarkers(videoPath) {
  const filename = path.basename(videoPath);
  const pathKey = videoPath.replace(/[^a-zA-Z0-9]/g, '_');
  
  // Check user-saved markers first
  const savedMarkers = loadMarkers();
  if (savedMarkers[pathKey]) {
    console.log('[Markers] Using saved markers');
    return {
      ...savedMarkers[pathKey],
      source: 'user'
    };
  }

  // Try to get chapter markers from video
  const { chapters, duration } = await getChapterMarkers(videoPath);
  const episodeInfo = extractEpisodeInfo(filename);
  
  let markers;
  
  if (chapters.length > 0) {
    markers = detectFromChapters(chapters, duration);
    markers.source = 'chapters';
    markers.chapters = chapters;
  } else {
    markers = applyHeuristics(duration, episodeInfo);
  }

  markers.duration = duration;
  markers.episodeInfo = episodeInfo;
  
  return markers;
}

/**
 * Save user-contributed marker
 */
function saveEpisodeMarker(videoPath, markerType, time) {
  const pathKey = videoPath.replace(/[^a-zA-Z0-9]/g, '_');
  const markers = loadMarkers();
  
  if (!markers[pathKey]) {
    markers[pathKey] = {};
  }
  
  markers[pathKey][markerType] = time;
  markers[pathKey].updatedAt = new Date().toISOString();
  
  saveMarkers(markers);
  console.log(`[Markers] Saved ${markerType}=${time} for ${path.basename(videoPath)}`);
  
  return markers[pathKey];
}

/**
 * Get next episode in a series
 */
function getNextEpisode(shows, currentPath) {
  const filename = path.basename(currentPath);
  const episodeInfo = extractEpisodeInfo(filename);
  
  if (!episodeInfo) {
    return null;
  }

  // Find the show this episode belongs to
  for (const show of shows) {
    for (const season of show.seasons || []) {
      const episodes = season.episodes || [];
      
      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        
        // Check if this is the current episode
        if (ep.path === currentPath || path.basename(ep.path) === filename) {
          // Return next episode in same season
          if (i + 1 < episodes.length) {
            const nextEp = episodes[i + 1];
            const nextEpInfo = extractEpisodeInfo(nextEp.path);
            return {
              ...nextEp,
              showTitle: show.title,
              seasonNumber: season.seasonNumber,
              episodeNumber: nextEpInfo?.episode || nextEp.episodeNumber || (i + 2)
            };
          }
          
          // Check next season
          const nextSeasonIndex = show.seasons.findIndex(s => s.seasonNumber === season.seasonNumber) + 1;
          if (nextSeasonIndex < show.seasons.length) {
            const nextSeason = show.seasons[nextSeasonIndex];
            if (nextSeason.episodes && nextSeason.episodes.length > 0) {
              const nextEp = nextSeason.episodes[0];
              const nextEpInfo = extractEpisodeInfo(nextEp.path);
              return {
                ...nextEp,
                showTitle: show.title,
                seasonNumber: nextSeason.seasonNumber,
                episodeNumber: nextEpInfo?.episode || nextEp.episodeNumber || 1
              };
            }
          }
          
          // No more episodes
          return null;
        }
      }
    }
  }
  
  return null;
}

module.exports = {
  getEpisodeMarkers,
  saveEpisodeMarker,
  getNextEpisode,
  extractEpisodeInfo
};
