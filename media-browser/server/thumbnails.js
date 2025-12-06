const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Cache directory for thumbnails
const CACHE_DIR = '/tmp/danflix-thumbnails';

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate a cache key from a file path
 */
function getCacheKey(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

/**
 * Get the cached thumbnail path for a video
 */
function getCachePath(filePath) {
  const key = getCacheKey(filePath);
  return path.join(CACHE_DIR, `${key}.jpg`);
}

/**
 * Check if a thumbnail is already cached
 */
function isCached(filePath) {
  const cachePath = getCachePath(filePath);
  return fs.existsSync(cachePath);
}

/**
 * Generate a thumbnail from a video file
 * Extracts a frame at ~10% into the video for a more interesting image
 * @param {string} filePath - Path to the video file
 * @returns {Promise<string>} Path to the generated thumbnail
 */
async function generateThumbnail(filePath) {
  const cachePath = getCachePath(filePath);
  
  // Return cached version if available
  if (isCached(filePath)) {
    return cachePath;
  }
  
  return new Promise((resolve, reject) => {
    // Extract a frame at 10% into the video, with a fallback to 5 seconds
    // Use a two-pass approach: first get duration, then extract frame
    const args = [
      '-ss', '10',           // Seek to 10 seconds (fast seek before input)
      '-i', filePath,
      '-vframes', '1',       // Extract one frame
      '-vf', 'scale=400:-2', // Scale to 400px width, maintain aspect ratio
      '-q:v', '3',           // JPEG quality (2-31, lower is better)
      '-y',                  // Overwrite output
      cachePath
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(cachePath)) {
        resolve(cachePath);
      } else {
        // Try again with frame at 1 second (for short videos)
        const retryArgs = [
          '-ss', '1',
          '-i', filePath,
          '-vframes', '1',
          '-vf', 'scale=400:-2',
          '-q:v', '3',
          '-y',
          cachePath
        ];
        
        const retry = spawn('ffmpeg', retryArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        retry.on('close', (retryCode) => {
          if (retryCode === 0 && fs.existsSync(cachePath)) {
            resolve(cachePath);
          } else {
            reject(new Error(`Failed to generate thumbnail: ${stderr}`));
          }
        });
        
        retry.on('error', (err) => {
          reject(err);
        });
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Pre-generate thumbnails for multiple files in the background
 * This is non-blocking and processes files sequentially to avoid overloading
 */
async function preGenerateThumbnails(filePaths, downloadsPath) {
  console.log(`[Thumbnails] Pre-generating ${filePaths.length} thumbnails...`);
  let generated = 0;
  let cached = 0;
  let failed = 0;
  
  for (const relativePath of filePaths) {
    const fullPath = path.join(downloadsPath, relativePath);
    
    if (isCached(fullPath)) {
      cached++;
      continue;
    }
    
    try {
      await generateThumbnail(fullPath);
      generated++;
    } catch (err) {
      failed++;
      // Don't log every failure, just count them
    }
  }
  
  console.log(`[Thumbnails] Complete: ${generated} generated, ${cached} cached, ${failed} failed`);
}

module.exports = {
  generateThumbnail,
  isCached,
  getCachePath,
  preGenerateThumbnails
};
