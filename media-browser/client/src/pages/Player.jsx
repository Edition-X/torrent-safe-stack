import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  SkipBack, 
  SkipForward,
  Settings,
  Subtitles,
  RotateCcw,
  ChevronRight
} from 'lucide-react';
import { getStreamUrl, getTranscodeUrl, getAutoSubtitleUrl, fetchMediaInfo, saveWatchProgress, fetchWatchProgress, fetchNextEpisode } from '../hooks/useApi';

function Player() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);
  
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState('');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitlesAvailable, setSubtitlesAvailable] = useState(true);
  const [mediaInfo, setMediaInfo] = useState(null);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [probing, setProbing] = useState(true);
  const [transcodeStartTime, setTranscodeStartTime] = useState(0); // For seeking in transcoded videos
  const [savedProgress, setSavedProgress] = useState(null);
  const [hasRestoredPosition, setHasRestoredPosition] = useState(false);
  const [hasMarkedCompleted, setHasMarkedCompleted] = useState(false);
  
  // Next episode state
  const [nextEpisode, setNextEpisode] = useState(null);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(10);
  const [autoPlayCancelled, setAutoPlayCancelled] = useState(false);
  const countdownRef = useRef(null);
  
  // 4K upscale option
  const [upscale4k, setUpscale4k] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Fullscreen state for cursor hiding
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Get video path from URL
  const videoPath = params['*'] || '';
  
  // Determine the stream URL based on media info and quality settings
  const buildTranscodeUrl = () => {
    const params = new URLSearchParams();
    if (transcodeStartTime > 0) params.set('t', transcodeStartTime.toString());
    if (upscale4k) params.set('upscale', '4k');
    const queryString = params.toString();
    return `${getTranscodeUrl(videoPath)}${queryString ? `?${queryString}` : ''}`;
  };
  
  // Force transcoding if 4K upscale is enabled
  const needsTranscode = mediaInfo?.needsTranscode || upscale4k;
  const streamUrl = needsTranscode 
    ? buildTranscodeUrl()
    : getStreamUrl(videoPath);
  
  // Use probed duration for transcoded videos, video element duration for direct streams
  const totalDuration = isTranscoding && mediaInfo?.duration ? mediaInfo.duration : duration;
  
  // Extract filename and build base title
  const fileName = videoPath.split('/').pop() || 'Video';
  const baseTitle = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/\./g, ' ')
    .replace(/\[.*?\]/g, '')
    .trim();

  // Metadata passed from routes for TV episodes (ShowDetails, Hero continue watching, next episode)
  const playbackMeta = (location && location.state) || {};
  const isEpisodeFromState = playbackMeta?.type === 'episode';

  // Prefer a clean episode name when we know this is a TV episode
  let episodeNameFromState = playbackMeta?.episodeName;
  if (isEpisodeFromState && !episodeNameFromState) {
    // Try to extract the part after SxxEyy / 1x01 from the filename
    const match = fileName.match(/^(.*?)[._\s-]*(S\d{1,2}E\d{1,2}|\d{1,2}x\d{1,2})[._\s-]*(.*)$/i);
    if (match && match[3]) {
      let ep = match[3];
      // Remove file extension
      ep = ep.replace(/\.[^/.]+$/, '');
      // Remove brackets and their contents first
      ep = ep.replace(/\[.*?\]/g, '');
      // Remove quality indicators and everything after (can start at beginning or after separator)
      ep = ep.replace(/^[._\s-]*(720p|1080p|2160p|4K|HDTV|WEB|BluRay|HEVC|x265|x264|AAC|DDP|HDR|SDR).*/gi, '');
      ep = ep.replace(/[._\s-]+(720p|1080p|2160p|4K|HDTV|WEB|BluRay|HEVC|x265|x264|AAC|DDP|HDR|SDR).*/gi, '');
      // Replace dots/underscores with spaces
      ep = ep.replace(/[._]/g, ' ');
      ep = ep.trim();
      episodeNameFromState = ep || null;
    }
  }

  // For TV episodes: show episode name if available, otherwise show "Show Title - SxxEyy"
  // For movies: show the cleaned filename
  let displayTitle = baseTitle;
  if (isEpisodeFromState) {
    if (episodeNameFromState) {
      displayTitle = episodeNameFromState;
    } else if (playbackMeta.showTitle && playbackMeta.season && playbackMeta.episode) {
      displayTitle = `${playbackMeta.showTitle} - S${String(playbackMeta.season).padStart(2, '0')}E${String(playbackMeta.episode).padStart(2, '0')}`;
    }
  }

  const watchType = isEpisodeFromState ? 'episode' : 'movie';
  const watchShowTitle = isEpisodeFromState ? playbackMeta.showTitle : undefined;
  const watchSeason = isEpisodeFromState ? playbackMeta.season : undefined;
  const watchEpisode = isEpisodeFromState ? playbackMeta.episode : undefined;

  // Go back function - for TV episodes, go to the show page; otherwise go home
  const goBack = useCallback(() => {
    if (isEpisodeFromState && playbackMeta?.showTitle) {
      // Navigate to the TV show page
      const showSlug = playbackMeta.showTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      navigate(`/tv/${showSlug}`);
    } else {
      navigate('/');
    }
  }, [navigate, isEpisodeFromState, playbackMeta]);

  // Use auto-subtitle endpoint - include start time offset for transcoded videos
  const autoSubtitleUrl = isTranscoding && transcodeStartTime > 0
    ? `${getAutoSubtitleUrl(videoPath)}?offset=${transcodeStartTime}`
    : getAutoSubtitleUrl(videoPath);

  // Control subtitle track visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks || video.textTracks.length === 0) return;
    
    const track = video.textTracks[0];
    track.mode = subtitlesEnabled ? 'showing' : 'hidden';
    console.log(`[Player] Subtitles mode: ${track.mode}`);
  }, [subtitlesEnabled]);

  // Fetch media info to determine if transcoding is needed
  useEffect(() => {
    if (!videoPath) return;
    
    setProbing(true);
    fetchMediaInfo(videoPath)
      .then(info => {
        setMediaInfo(info);
        setIsTranscoding(info.needsTranscode);
        if (info.needsTranscode) {
          console.log(`[Player] Transcoding needed: ${info.reason}`);
        } else {
          console.log(`[Player] Direct streaming (${info.videoCodec}/${info.audioCodec})`);
        }
      })
      .catch(err => {
        console.error('Failed to probe media:', err);
        // Fallback: try direct streaming
        setMediaInfo({ needsTranscode: false });
      })
      .finally(() => setProbing(false));
  }, [videoPath]);

  // Update transcoding state when 4K option changes
  useEffect(() => {
    if (upscale4k) {
      setIsTranscoding(true);
      console.log('[Player] 4K upscaling enabled - forcing transcode');
    } else if (mediaInfo) {
      setIsTranscoding(mediaInfo.needsTranscode);
    }
  }, [upscale4k, mediaInfo]);

  // Load saved progress on mount
  useEffect(() => {
    if (!videoPath) return;
    
    fetchWatchProgress(videoPath).then(progress => {
      if (progress && progress.currentTime > 0) {
        console.log(`[Player] Found saved progress: ${progress.currentTime}s`);
        setSavedProgress(progress);
      }
    });
  }, [videoPath]);

  // Reset session-specific flags when the video changes
  useEffect(() => {
    setHasRestoredPosition(false);
    setHasMarkedCompleted(false);
  }, [videoPath]);

  // Fetch next episode info
  useEffect(() => {
    if (!videoPath) return;
    
    fetchNextEpisode(videoPath).then(result => {
      if (result?.hasNext) {
        console.log('[Player] Next episode:', result.episode);
        setNextEpisode(result.episode);
      }
    });
  }, [videoPath]);

  // Show next episode overlay and handle countdown
  useEffect(() => {
    if (!nextEpisode || !totalDuration || autoPlayCancelled) return;
    
    const actualTime = isTranscoding ? transcodeStartTime + currentTime : currentTime;
    const timeRemaining = totalDuration - actualTime;
    
    // Show next episode when 30 seconds or less remaining
    if (timeRemaining <= 30 && timeRemaining > 0 && playing) {
      if (!showNextEpisode) {
        setShowNextEpisode(true);
        setNextEpisodeCountdown(10);
      }
    } else if (timeRemaining > 30) {
      setShowNextEpisode(false);
      setAutoPlayCancelled(false);
    }
  }, [currentTime, totalDuration, nextEpisode, playing, showNextEpisode, autoPlayCancelled, isTranscoding, transcodeStartTime]);

  // Countdown timer for auto-play next episode
  useEffect(() => {
    if (!showNextEpisode || autoPlayCancelled || !playing) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }
    
    countdownRef.current = setInterval(() => {
      setNextEpisodeCountdown(prev => {
        if (prev <= 1) {
          // Auto-play next episode
          clearInterval(countdownRef.current);
          playNextEpisode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [showNextEpisode, autoPlayCancelled, playing]);

  // Seek forward/backward by seconds
  const seekBy = useCallback((seconds) => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isTranscoding) {
      // For transcoded videos, restart with new time
      const newTime = Math.max(0, Math.min(totalDuration, transcodeStartTime + currentTime + seconds));
      setTranscodeStartTime(newTime);
    } else {
      const newTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
      video.currentTime = newTime;
    }
  }, [isTranscoding, transcodeStartTime, currentTime, totalDuration]);

  // Play next episode handler
  const playNextEpisode = useCallback(() => {
    if (!nextEpisode?.path) return;

    const nextState = {
      type: 'episode',
      showTitle: nextEpisode.showTitle,
      season: nextEpisode.seasonNumber,
      episode: nextEpisode.episodeNumber,
      episodeName: nextEpisode.title || undefined
    };

    navigate(`/play/${encodeURIComponent(nextEpisode.path)}`, { state: nextState });
  }, [nextEpisode, navigate]);

  // Cancel auto-play
  const cancelAutoPlay = useCallback(() => {
    setAutoPlayCancelled(true);
    setShowNextEpisode(false);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
  }, []);

  // Restore playback position when video is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !savedProgress || hasRestoredPosition) return;
    
    const handleCanPlay = () => {
      if (!hasRestoredPosition && savedProgress.currentTime > 0) {
        // Don't restore if near the end (>95%)
        const savedPercent = (savedProgress.currentTime / savedProgress.duration) * 100;
        if (savedPercent < 95) {
          console.log(`[Player] Restoring position to ${savedProgress.currentTime}s`);
          if (isTranscoding) {
            // For transcoded videos, restart with seek time
            setTranscodeStartTime(savedProgress.currentTime);
          } else {
            video.currentTime = savedProgress.currentTime;
          }
        }
        setHasRestoredPosition(true);
      }
    };
    
    video.addEventListener('canplay', handleCanPlay);
    return () => video.removeEventListener('canplay', handleCanPlay);
  }, [savedProgress, hasRestoredPosition, isTranscoding]);

  // Save progress periodically (every 10 seconds)
  useEffect(() => {
    if (!videoPath || !playing) return;
    
    const saveInterval = setInterval(() => {
      const video = videoRef.current;
      if (video && video.currentTime > 0) {
        const actualTime = isTranscoding ? transcodeStartTime + video.currentTime : video.currentTime;
        const actualDuration = totalDuration || video.duration;
        
        saveWatchProgress({
          path: videoPath,
          title: displayTitle,
          type: watchType,
          showTitle: watchShowTitle,
          season: watchSeason,
          episode: watchEpisode,
          currentTime: actualTime,
          duration: actualDuration
        });
      }
    }, 10000);
    
    return () => clearInterval(saveInterval);
  }, [videoPath, playing, displayTitle, isTranscoding, transcodeStartTime, totalDuration]);

  // When playback passes ~95%, eagerly mark as completed so history/resume reflect latest session
  useEffect(() => {
    if (!videoPath || !totalDuration || hasMarkedCompleted) return;

    const actualTime = isTranscoding ? transcodeStartTime + currentTime : currentTime;
    const percent = totalDuration > 0 ? (actualTime / totalDuration) * 100 : 0;
    if (percent >= 95) {
      setHasMarkedCompleted(true);
      const finalTime = totalDuration;

      console.log('[Player] Marking item as completed at', finalTime, 'seconds');
      saveWatchProgress({
        path: videoPath,
        title: displayTitle,
        type: watchType,
        showTitle: watchShowTitle,
        season: watchSeason,
        episode: watchEpisode,
        currentTime: finalTime,
        duration: totalDuration
      });
    }
  }, [videoPath, totalDuration, currentTime, transcodeStartTime, isTranscoding, displayTitle, hasMarkedCompleted, watchType, watchShowTitle, watchSeason, watchEpisode]);

  // Save progress on pause and before leaving
  useEffect(() => {
    const saveCurrentProgress = () => {
      const video = videoRef.current;
      if (video && video.currentTime > 0) {
        const actualTime = isTranscoding ? transcodeStartTime + video.currentTime : video.currentTime;
        const actualDuration = totalDuration || video.duration;
        
        saveWatchProgress({
          path: videoPath,
          title: displayTitle,
          type: watchType,
          showTitle: watchShowTitle,
          season: watchSeason,
          episode: watchEpisode,
          currentTime: actualTime,
          duration: actualDuration
        });
      }
    };
    
    // Save on page unload
    window.addEventListener('beforeunload', saveCurrentProgress);
    
    return () => {
      window.removeEventListener('beforeunload', saveCurrentProgress);
      saveCurrentProgress(); // Also save when component unmounts
    };
  }, [videoPath, displayTitle, isTranscoding, transcodeStartTime, totalDuration]);

  // Load video when media info is ready or when seeking in transcoded video
  useEffect(() => {
    if (!probing && mediaInfo && videoRef.current) {
      console.log(`[Player] Loading video from: ${streamUrl}`);
      videoRef.current.load();
      // Auto-play after seeking
      if (transcodeStartTime > 0) {
        videoRef.current.play().catch(e => console.log('Auto-play prevented:', e));
      }
    }
  }, [probing, mediaInfo, streamUrl, transcodeStartTime]);

  useEffect(() => {
    let hideTimeout;
    
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (playing) setShowControls(false);
      }, 3000);
    };

    const container = containerRef.current;
    container?.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      container?.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(hideTimeout);
    };
  }, [playing]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleWaiting = () => setLoading(true);
    const handleCanPlay = () => setLoading(false);
    const handleError = (e) => {
      const videoEl = e.target;
      let details = '';
      
      if (videoEl.error) {
        switch (videoEl.error.code) {
          case 1:
            details = 'Video loading was aborted';
            break;
          case 2:
            details = 'Network error while loading video';
            break;
          case 3:
            details = 'Video codec not supported by browser (HEVC/x265 files may not play)';
            break;
          case 4:
            details = 'Video format not supported';
            break;
          default:
            details = 'Unknown error';
        }
      }
      
      // Check if it's likely a codec issue based on filename
      const path = videoPath.toLowerCase();
      if (path.includes('x265') || path.includes('hevc') || path.includes('10bit')) {
        details = 'This video uses HEVC/x265 codec which is not supported by most browsers. Try a different video or use VLC player.';
      }
      
      setErrorDetails(details);
      setError('Failed to load video');
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, [probing, mediaInfo, videoPath]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5); // Skip back 5 seconds
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5); // Skip forward 5 seconds
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(-0.1);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            goBack();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [seekBy, volume, goBack]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const changeVolume = (delta) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    video.volume = newVolume;
    setVolume(newVolume);
    setMuted(newVolume === 0);
  };

  const seekToTime = useCallback((targetTime) => {
    if (!isTranscoding) {
      // Direct stream - just set currentTime
      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
      }
      return;
    }
    
    // Transcoded video - need to restart transcoding from new position
    console.log(`[Player] Seeking transcoded video to ${targetTime}s`);
    setLoading(true);
    setTranscodeStartTime(targetTime);
    setCurrentTime(0); // Reset local time since we're starting fresh
  }, [isTranscoding]);

  const skip = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    
    // Calculate the actual current time (accounting for transcode start offset)
    const actualCurrentTime = isTranscoding ? transcodeStartTime + currentTime : currentTime;
    const targetTime = Math.max(0, Math.min(totalDuration, actualCurrentTime + seconds));
    
    if (isTranscoding) {
      // For transcoded videos, we need to restart transcoding from the new position
      seekToTime(targetTime);
    } else {
      video.currentTime = targetTime;
    }
  };

  // Restart episode from the beginning
  const restartEpisode = useCallback(() => {
    if (isTranscoding) {
      setTranscodeStartTime(0);
      setCurrentTime(0);
      setLoading(true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [isTranscoding]);

  const handleProgressClick = (e) => {
    const video = videoRef.current;
    const progress = progressRef.current;
    if (!video || !progress) return;

    const rect = progress.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const targetTime = percent * totalDuration;
    
    if (isTranscoding) {
      seekToTime(targetTime);
    } else {
      video.currentTime = targetTime;
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate actual playback position (accounting for transcode start offset)
  const actualCurrentTime = isTranscoding ? transcodeStartTime + currentTime : currentTime;
  const progress = totalDuration > 0 ? (actualCurrentTime / totalDuration) * 100 : 0;

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8">
        <p className="text-red-500 text-xl mb-2">{error}</p>
        {errorDetails && (
          <p className="text-gray-400 text-sm mb-6 text-center max-w-md">{errorDetails}</p>
        )}
        <button
          onClick={goBack}
          className="text-white flex items-center space-x-2 hover:text-netflix-red transition-colors bg-gray-800 px-4 py-2 rounded-lg"
        >
          <ArrowLeft size={20} />
          <span>Go Back</span>
        </button>
      </div>
    );
  }

  // Handle container click - toggle play and close menus
  const handleContainerClick = () => {
    setShowQualityMenu(false);
    togglePlay();
  };

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[100] bg-black flex items-center justify-center ${
        isFullscreen && !showControls ? 'cursor-none' : ''
      }`}
      onClick={handleContainerClick}
    >
      {/* Video - only render after probing completes */}
      {!probing && mediaInfo && (
        <video
          ref={videoRef}
          src={streamUrl}
          className="w-full h-full object-contain"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={toggleFullscreen}
          crossOrigin="anonymous"
        >
          <track
            key={autoSubtitleUrl}
            kind="subtitles"
            src={autoSubtitleUrl}
            srcLang="en"
            label="English"
            default={subtitlesEnabled}
            onError={() => {
              console.log('[Player] Subtitles not available');
              setSubtitlesAvailable(false);
            }}
            onLoad={() => {
              console.log('[Player] Subtitles loaded');
              setSubtitlesAvailable(true);
            }}
          />
        </video>
      )}

      {/* Loading indicator */}
      {(loading || probing) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
          <div className="w-16 h-16 border-4 border-netflix-red border-t-transparent rounded-full spinner" />
          {probing && (
            <p className="text-white mt-4 text-sm">Analyzing video...</p>
          )}
          {!probing && isTranscoding && loading && (
            <p className="text-white mt-4 text-sm">Transcoding video for playback...</p>
          )}
        </div>
      )}

      {/* Next Episode Overlay */}
      {showNextEpisode && nextEpisode && !loading && (
        <div
          className="absolute bottom-32 right-8 z-50 bg-black/90 border border-gray-700 rounded-lg p-4 w-80 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-gray-400 text-sm mb-2">Up Next</div>
          <div className="text-white font-semibold text-lg mb-1">
            {nextEpisode.showTitle || 'Next Episode'}
          </div>
          <div className="text-gray-300 text-sm mb-4">
            S{String(nextEpisode.seasonNumber || 1).padStart(2, '0')}E{String(nextEpisode.episodeNumber || nextEpisode.episode || 1).padStart(2, '0')}
            {nextEpisode.title && ` - ${nextEpisode.title}`}
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={playNextEpisode}
              className="flex-1 bg-white hover:bg-gray-200 text-black font-semibold py-2 px-4 rounded flex items-center justify-center space-x-2 transition-colors"
            >
              <Play size={18} fill="black" />
              <span>Play Now</span>
            </button>
            <button
              onClick={cancelAutoPlay}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
          
          {!autoPlayCancelled && (
            <div className="mt-3 text-center">
              <div className="text-gray-400 text-sm">
                Playing in {nextEpisodeCountdown}s
              </div>
              <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-netflix-red transition-all duration-1000"
                  style={{ width: `${(nextEpisodeCountdown / 10) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-6 pt-8 bg-gradient-to-b from-black via-black/60 to-transparent">
          <div className="flex items-center space-x-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                goBack();
              }}
              className="text-white hover:text-netflix-red transition-colors p-2 -ml-2 rounded-full hover:bg-white/10"
            >
              <ArrowLeft size={32} />
            </button>
            <h1 className="text-white text-xl font-medium truncate flex-1 pr-4">
              {displayTitle}
              {isTranscoding && (
                <span className="ml-3 text-xs bg-netflix-red/80 px-2 py-1 rounded align-middle">
                  TRANSCODING
                </span>
              )}
            </h1>
          </div>
        </div>

        {/* Center play button */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="pointer-events-auto bg-white/20 hover:bg-white/30 backdrop-blur rounded-full p-6 transition-colors"
          >
            {playing ? (
              <Pause size={48} className="text-white" fill="white" />
            ) : (
              <Play size={48} className="text-white ml-2" fill="white" />
            )}
          </button>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-1 bg-gray-600 rounded-full mb-4 cursor-pointer group"
            onClick={handleProgressClick}
          >
            <div
              className="absolute h-full bg-netflix-red rounded-full"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-netflix-red rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 8px)` }}
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={togglePlay} className="text-white hover:text-netflix-red transition-colors">
                {playing ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" />}
              </button>
              
              <button 
                onClick={restartEpisode} 
                className="text-white hover:text-netflix-red transition-colors"
                title="Restart"
              >
                <RotateCcw size={22} />
              </button>
              
              <button onClick={() => skip(-10)} className="text-white hover:text-netflix-red transition-colors">
                <SkipBack size={24} />
              </button>
              
              <button onClick={() => skip(10)} className="text-white hover:text-netflix-red transition-colors">
                <SkipForward size={24} />
              </button>
              
              {nextEpisode && (
                <button 
                  onClick={playNextEpisode} 
                  className="text-white hover:text-netflix-red transition-colors flex items-center space-x-1"
                  title={`Next: ${nextEpisode.title || `Episode ${nextEpisode.episodeNumber}`}`}
                >
                  <ChevronRight size={24} />
                  <span className="text-sm hidden sm:inline">Next</span>
                </button>
              )}

              <div className="flex items-center space-x-2 group">
                <button onClick={toggleMute} className="text-white hover:text-netflix-red transition-colors">
                  {muted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    setMuted(v === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      videoRef.current.muted = false;
                    }
                  }}
                  className="w-0 group-hover:w-20 transition-all duration-200 accent-netflix-red"
                />
              </div>

              <span className="text-white text-sm">
                {formatTime(actualCurrentTime)} / {formatTime(totalDuration)}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  if (subtitlesAvailable) {
                    setSubtitlesEnabled(!subtitlesEnabled);
                  }
                }}
                className={`transition-colors ${
                  !subtitlesAvailable 
                    ? 'text-gray-600 cursor-not-allowed' 
                    : subtitlesEnabled 
                      ? 'text-netflix-red' 
                      : 'text-white hover:text-netflix-red'
                }`}
                title={subtitlesAvailable ? (subtitlesEnabled ? 'Hide subtitles' : 'Show subtitles') : 'No subtitles available'}
              >
                <Subtitles size={24} />
              </button>
              
              {/* Quality Settings */}
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className={`transition-colors ${upscale4k ? 'text-netflix-red' : 'text-white hover:text-netflix-red'}`}
                  title="Video quality"
                >
                  <Settings size={24} />
                </button>
                
                {showQualityMenu && (
                  <div 
                    className="absolute bottom-full right-0 mb-2 bg-black/95 border border-gray-700 rounded-lg p-3 min-w-48 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-gray-400 text-xs uppercase mb-2 font-semibold">Quality</div>
                    
                    <button
                      onClick={() => {
                        setUpscale4k(false);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded flex items-center justify-between ${
                        !upscale4k ? 'bg-netflix-red text-white' : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <span>Auto</span>
                      <span className="text-xs text-gray-400">
                        {mediaInfo?.video?.height ? `${mediaInfo.video.height}p` : ''}
                      </span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setUpscale4k(true);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded flex items-center justify-between mt-1 ${
                        upscale4k ? 'bg-netflix-red text-white' : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <span>4K Upscale</span>
                      <span className="text-xs text-gray-400">2160p</span>
                    </button>
                    
                    {upscale4k && (
                      <div className="text-xs text-yellow-500 mt-2 px-1">
                        ⚠️ CPU intensive
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-netflix-red transition-colors"
              >
                <Maximize size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Player;
