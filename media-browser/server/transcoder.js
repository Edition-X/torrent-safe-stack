const { spawn } = require('child_process');
const path = require('path');

// Codecs that browsers can play natively
const BROWSER_COMPATIBLE_VIDEO = ['h264', 'vp8', 'vp9', 'av1'];
const BROWSER_COMPATIBLE_AUDIO = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];

/**
 * Probe a media file to get codec information
 * @param {string} filePath - Path to the media file
 * @returns {Promise<object>} Media info including codecs and whether transcoding is needed
 */
async function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];

    const ffprobe = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const result = analyzeStreams(info);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to start ffprobe: ${err.message}`));
    });
  });
}

/**
 * Analyze streams from ffprobe output
 */
function analyzeStreams(info) {
  const streams = info.streams || [];
  const format = info.format || {};

  let videoStream = null;
  let audioStream = null;

  for (const stream of streams) {
    if (stream.codec_type === 'video' && !videoStream) {
      videoStream = {
        codec: stream.codec_name,
        width: stream.width,
        height: stream.height,
        bitrate: stream.bit_rate,
        fps: eval(stream.r_frame_rate) || 24, // e.g., "24000/1001"
        pixelFormat: stream.pix_fmt,
        profile: stream.profile
      };
    } else if (stream.codec_type === 'audio' && !audioStream) {
      audioStream = {
        codec: stream.codec_name,
        channels: stream.channels,
        sampleRate: stream.sample_rate,
        bitrate: stream.bit_rate
      };
    }
  }

  const videoCodec = videoStream?.codec?.toLowerCase() || 'unknown';
  const audioCodec = audioStream?.codec?.toLowerCase() || 'unknown';

  // Check if transcoding is needed
  const videoNeedsTranscode = !BROWSER_COMPATIBLE_VIDEO.includes(videoCodec);
  const audioNeedsTranscode = !BROWSER_COMPATIBLE_AUDIO.includes(audioCodec);
  
  // Also check for 10-bit which browsers don't handle well
  const is10Bit = videoStream?.pixelFormat?.includes('10') || 
                  videoStream?.pixelFormat?.includes('12') ||
                  videoStream?.profile?.toLowerCase().includes('10');

  const needsTranscode = videoNeedsTranscode || audioNeedsTranscode || is10Bit;

  return {
    duration: parseFloat(format.duration) || 0,
    size: parseInt(format.size) || 0,
    bitrate: parseInt(format.bit_rate) || 0,
    video: videoStream,
    audio: audioStream,
    videoCodec,
    audioCodec,
    videoNeedsTranscode,
    audioNeedsTranscode,
    is10Bit,
    needsTranscode,
    reason: needsTranscode ? buildReason(videoNeedsTranscode, audioNeedsTranscode, is10Bit, videoCodec, audioCodec) : null
  };
}

function buildReason(videoNeedsTranscode, audioNeedsTranscode, is10Bit, videoCodec, audioCodec) {
  const reasons = [];
  if (videoNeedsTranscode) reasons.push(`video codec ${videoCodec} not supported`);
  if (audioNeedsTranscode) reasons.push(`audio codec ${audioCodec} not supported`);
  if (is10Bit) reasons.push('10-bit color depth not supported');
  return reasons.join(', ');
}

/**
 * Create a transcoding stream for a media file
 * @param {string} filePath - Path to the media file
 * @param {object} options - Transcoding options
 * @returns {ChildProcess} The FFmpeg process with stdout as the video stream
 */
function createTranscodeStream(filePath, options = {}) {
  const {
    videoCodec = 'libx264',
    audioCodec = 'aac',
    videoBitrate = '4M',
    audioBitrate = '192k',
    preset = 'fast',
    crf = 23,
    startTime = null,
    upscale4k = false,
  } = options;

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
  ];

  // Add start time if seeking
  if (startTime !== null && startTime > 0) {
    args.push('-ss', startTime.toString());
  }

  // Determine video filter based on upscale option
  let videoFilter;
  let bitrate = videoBitrate;
  let bufsize = '8M';
  
  if (upscale4k) {
    // Upscale to 4K with lanczos algorithm and sharpening
    videoFilter = 'scale=3840:2160:flags=lanczos,unsharp=5:5:0.8:5:5:0.4,setpts=PTS-STARTPTS';
    bitrate = '15M'; // Higher bitrate for 4K
    bufsize = '30M';
    console.log('[Transcode] Upscaling to 4K');
  } else {
    // Scale down to 1080p for faster transcoding
    videoFilter = 'scale=1920:-2,setpts=PTS-STARTPTS';
  }

  args.push(
    '-i', filePath,
    // Video encoding
    '-c:v', videoCodec,
    '-preset', preset,
    '-crf', crf.toString(),
    '-maxrate', bitrate,
    '-bufsize', bufsize,
    '-vf', videoFilter,
    // Audio encoding - reset audio timestamps to sync with video
    '-c:a', audioCodec,
    '-b:a', audioBitrate,
    '-ac', '2', // Stereo
    '-af', 'asetpts=PTS-STARTPTS',
    // Output format - fragmented MP4 for streaming
    '-movflags', 'frag_keyframe+empty_moov+faststart',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'mp4',
    // Output to stdout
    'pipe:1'
  );

  const ffmpeg = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Log errors but don't crash
  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    // Only log actual errors, not progress info
    if (msg.includes('Error') || msg.includes('error')) {
      console.error('[FFmpeg Error]', msg);
    }
  });

  return ffmpeg;
}

/**
 * Quick check if a file likely needs transcoding based on filename
 * This is a fast heuristic before doing full probe
 */
function likelyNeedsTranscode(filename) {
  const lower = filename.toLowerCase();
  return lower.includes('x265') || 
         lower.includes('hevc') || 
         lower.includes('10bit') ||
         lower.includes('10-bit') ||
         lower.includes('h.265') ||
         lower.includes('h265');
}

module.exports = {
  probeMedia,
  createTranscodeStream,
  likelyNeedsTranscode,
  BROWSER_COMPATIBLE_VIDEO,
  BROWSER_COMPATIBLE_AUDIO
};
