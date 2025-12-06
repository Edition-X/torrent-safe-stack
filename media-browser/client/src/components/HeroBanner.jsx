import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Info, Tv, Film, RotateCcw } from 'lucide-react';
import { fetchBackdropUrl } from '../hooks/useApi';

function HeroBanner({ item, type = 'movie' }) {
  const [backdropUrl, setBackdropUrl] = useState(null);
  const [backdropLoaded, setBackdropLoaded] = useState(false);

  const isShow = type === 'tv';
  const isContinueWatching = item?._continueWatching;
  const isTvEpisode = isContinueWatching && item?._type === 'tv';
  const seasonNumber = isTvEpisode ? item?._season : null;
  const episodeNumber = isTvEpisode ? item?._episode : null;
  const episodeName = isTvEpisode ? item?._episodeName : null;
  
  // For continue watching, use the direct path; otherwise use show/movie logic
  const playPath = !item ? '/' : isContinueWatching
    ? `/play/${encodeURIComponent(item.path)}`
    : isShow
      ? (item.seasons?.[0]?.episodes?.[0]
          ? `/play/${encodeURIComponent(item.seasons[0].episodes[0].path)}`
          : `/tv/${item.id}`)
      : `/play/${encodeURIComponent(item.path)}`;
  
  const detailPath = !item ? '/' : isShow ? `/tv/${item.id}` : playPath;

  // Optional route state for TV episodes so Player knows episode metadata
  const playState = isTvEpisode && seasonNumber && episodeNumber
    ? {
        type: 'episode',
        showTitle: item.title,
        season: seasonNumber,
        episode: episodeNumber,
        episodeName: episodeName || undefined
      }
    : undefined;

  // Fetch backdrop image from TMDB - reset when item changes
  useEffect(() => {
    if (!item?.title) return;
    
    // Reset state when item changes
    setBackdropUrl(null);
    setBackdropLoaded(false);
    
    let cancelled = false;
    
    fetchBackdropUrl(isShow ? 'tv' : 'movie', item.title, item.year)
      .then(url => {
        if (!cancelled && url) {
          setBackdropUrl(url);
        }
      });
    
    return () => { cancelled = true; };
  }, [item?.title, item?.year, isShow]);

  if (!item) return null;

  // Generate gradient colors (fallback)
  const getGradient = (title) => {
    const gradients = [
      'from-purple-900 via-purple-700 to-indigo-900',
      'from-red-900 via-rose-700 to-pink-900',
      'from-blue-900 via-cyan-700 to-teal-900',
      'from-emerald-900 via-green-700 to-lime-900',
      'from-orange-900 via-amber-700 to-yellow-900',
    ];
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  // Format time remaining
  const formatTimeRemaining = () => {
    if (!item._duration || !item._currentTime) return null;
    const remaining = item._duration - item._currentTime;
    const minutes = Math.floor(remaining / 60);
    if (minutes < 60) return `${minutes}m remaining`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <div className={`relative h-[70vh] min-h-[500px] bg-gradient-to-br ${getGradient(item.title)}`}>
      {/* Backdrop image - uses original resolution for 4K quality */}
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          onLoad={() => setBackdropLoaded(true)}
          loading="eager"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${
            backdropLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ imageRendering: 'auto' }}
        />
      )}
      
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-netflix-black via-transparent to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-netflix-black/80 via-transparent to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-16 pb-24 sm:pb-32 max-w-3xl">
        {/* Type badge */}
        <div className="flex items-center space-x-2 mb-4">
          {isContinueWatching && (
            <span className="bg-netflix-red px-3 py-1 rounded text-sm font-medium flex items-center">
              <RotateCcw size={14} className="mr-1" />
              Continue Watching
            </span>
          )}
          {!isContinueWatching && (
            <span className="bg-netflix-red px-3 py-1 rounded text-sm font-medium flex items-center">
              {isShow ? <Tv size={14} className="mr-1" /> : <Film size={14} className="mr-1" />}
              {isShow ? 'TV Show' : 'Movie'}
            </span>
          )}
          {item.quality && (
            <span className="bg-gray-700 px-3 py-1 rounded text-sm font-medium">
              {item.quality}
            </span>
          )}
          {item.year && (
            <span className="bg-gray-700 px-3 py-1 rounded text-sm font-medium">
              {item.year}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-6xl font-bold text-white mb-4 drop-shadow-lg">
          {item.title}
        </h1>

        {/* Meta info */}
        <p className="text-gray-300 mb-4 text-lg">
          {isContinueWatching ? (
            <>
              {formatTimeRemaining()}
              {isTvEpisode && seasonNumber && episodeNumber && (
                <>
                  {formatTimeRemaining() ? ' • ' : ''}
                  S{String(seasonNumber).padStart(2, '0')}E{String(episodeNumber).padStart(2, '0')}
                  {episodeName && ` — ${episodeName}`}
                </>
              )}
            </>
          ) : isShow ? (
            <>
              {item.seasons?.length} Season{item.seasons?.length !== 1 ? 's' : ''} 
              {' • '}
              {item.episodeCount} Episode{item.episodeCount !== 1 ? 's' : ''}
            </>
          ) : (
            <>
              {item.sizeFormatted && <span>{item.sizeFormatted}</span>}
            </>
          )}
        </p>

        {/* Progress bar for continue watching */}
        {isContinueWatching && item._progress > 0 && (
          <div className="w-full max-w-md mb-6">
            <div className="h-1 bg-gray-600 rounded-full overflow-hidden">
              <div 
                className="h-full bg-netflix-red transition-all"
                style={{ width: `${Math.min(item._progress, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-wrap gap-4">
          <Link
            to={playPath}
            state={playState}
            className="flex items-center space-x-2 bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
          >
            <Play size={24} fill="black" />
            <span>{isContinueWatching ? 'Continue' : 'Play'}</span>
          </Link>

          {isShow && !isContinueWatching && (
            <Link
              to={detailPath}
              className="flex items-center space-x-2 bg-gray-600/80 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
            >
              <Info size={24} />
              <span>More Info</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default HeroBanner;
