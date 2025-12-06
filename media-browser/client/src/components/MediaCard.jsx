import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Info, Tv, Film, Calendar, HardDrive } from 'lucide-react';
import { getThumbnailUrl, fetchPosterUrl } from '../hooks/useApi';

// Generate a consistent color based on title
function getGradientColors(title) {
  const colors = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a8edea', '#fed6e3'],
    ['#ff9a9e', '#fecfef'],
    ['#ffecd2', '#fcb69f'],
    ['#667eea', '#764ba2'],
    ['#7f7fd5', '#86a8e7'],
  ];
  
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

function MediaCard({ item, type = 'movie', historyEntry }) {
  const [color1, color2] = getGradientColors(item.title);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [posterUrl, setPosterUrl] = useState(null);
  const [posterChecked, setPosterChecked] = useState(false);
  const isShow = type === 'tv';
  const progress = historyEntry?.progress || 0;
  const isUnavailable = historyEntry && historyEntry.available === false;
  
  const linkPath = isShow ? `/tv/${item.id}` : `/play/${encodeURIComponent(item.path)}`;
  const firstSeason = isShow ? item.seasons?.[0] : null;
  const firstEpisode = firstSeason?.episodes?.[0];
  const playPath = isShow 
    ? (firstEpisode 
        ? `/play/${encodeURIComponent(firstEpisode.path)}` 
        : linkPath)
    : linkPath;

  const playState = isShow && firstSeason && firstEpisode
    ? {
        type: 'episode',
        showTitle: item.title,
        season: firstSeason.seasonNumber,
        episode: firstEpisode.episodeNumber,
        episodeName: firstEpisode.title || `Episode ${firstEpisode.episodeNumber}`
      }
    : undefined;

  // Get thumbnail path - for TV shows, use first episode (fallback)
  const thumbnailPath = isShow 
    ? item.seasons?.[0]?.episodes?.[0]?.path 
    : item.path;

  // Fetch poster from TMDB on mount
  useEffect(() => {
    let cancelled = false;
    const useTvMetadata = isShow || item._isEpisode;
    const posterTitle = useTvMetadata && item._showTitle ? item._showTitle : item.title;

    fetchPosterUrl(useTvMetadata ? 'tv' : 'movie', posterTitle, item.year)
      .then(url => {
        if (!cancelled) {
          setPosterUrl(url);
          setPosterChecked(true);
        }
      });
    
    return () => { cancelled = true; };
  }, [item.title, item.year, isShow, item._isEpisode, item._showTitle]);

  // Use poster if available, otherwise fall back to thumbnail
  const imageUrl = posterUrl || (thumbnailPath ? getThumbnailUrl(thumbnailPath) : null);

  return (
    <div className="media-card group relative flex-shrink-0 w-44 sm:w-52 rounded-lg overflow-hidden cursor-pointer">
      {/* Outer clickable area - disabled when item is unavailable */}
      {isUnavailable ? (
        <div>
          {/* Poster with thumbnail or gradient fallback */}
          <div
            className="aspect-[2/3] relative"
            style={{
              background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`
            }}
          >
            {/* Poster/Thumbnail image with lazy loading */}
            {imageUrl && !imageError && (
              <img
                src={imageUrl}
                alt={item.title}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageError(true);
                  // If poster failed and we haven't tried thumbnail yet, try it
                  if (posterUrl && thumbnailPath) {
                    setImageError(false);
                    setImageLoaded(false);
                    setPosterUrl(null);
                  }
                }}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            )}
            
            {/* Title overlay - show when no thumbnail or as overlay */}
            <div className={`absolute inset-0 flex items-center justify-center p-4 transition-opacity ${
              imageLoaded ? 'opacity-0 group-hover:opacity-100 bg-black/60' : ''
            }`}>
              <span className="text-white text-center font-bold text-lg drop-shadow-lg line-clamp-3">
                {item.title}
              </span>
            </div>

            {/* Type badge */}
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1 flex items-center space-x-1">
              {isShow ? <Tv size={12} /> : <Film size={12} />}
              <span className="text-xs">{isShow ? 'TV' : 'Movie'}</span>
            </div>

            {/* Quality badge */}
            {item.quality && (
              <div className="absolute top-2 right-2 bg-netflix-red/90 rounded px-2 py-0.5">
                <span className="text-xs font-medium">{item.quality}</span>
              </div>
            )}

            {/* Unavailable badge */}
            {isUnavailable && (
              <div className="absolute bottom-2 left-2 bg-black/80 text-xs text-gray-200 px-2 py-1 rounded">
                Unavailable
              </div>
            )}

            {/* Watch progress bar */}
            {progress > 0 && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-black/50">
                <div
                  className="h-full bg-netflix-red"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <Link to={linkPath}>
        {/* Poster with thumbnail or gradient fallback */}
          <div
            className="aspect-[2/3] relative"
            style={{
              background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`
            }}
          >
          {/* Poster/Thumbnail image with lazy loading */}
          {imageUrl && !imageError && (
            <img
              src={imageUrl}
              alt={item.title}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageError(true);
                // If poster failed and we haven't tried thumbnail yet, try it
                if (posterUrl && thumbnailPath) {
                  setImageError(false);
                  setImageLoaded(false);
                  setPosterUrl(null);
                }
              }}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
          
          {/* Title overlay - show when no thumbnail or as overlay */}
          <div className={`absolute inset-0 flex items-center justify-center p-4 transition-opacity ${
            imageLoaded ? 'opacity-0 group-hover:opacity-100 bg-black/60' : ''
          }`}>
            <span className="text-white text-center font-bold text-lg drop-shadow-lg line-clamp-3">
              {item.title}
            </span>
          </div>

            {/* Type badge */}
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1 flex items-center space-x-1">
              {isShow ? <Tv size={12} /> : <Film size={12} />}
              <span className="text-xs">{isShow ? 'TV' : 'Movie'}</span>
            </div>

            {/* Quality badge */}
            {item.quality && (
              <div className="absolute top-2 right-2 bg-netflix-red/90 rounded px-2 py-0.5">
                <span className="text-xs font-medium">{item.quality}</span>
              </div>
            )}

            {/* Watch progress bar */}
            {progress > 0 && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-black/50">
                <div
                  className="h-full bg-netflix-red"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="flex space-x-3">
              <Link
                to={playPath}
                state={playState}
                className="bg-white rounded-full p-3 text-black hover:scale-110 transition-transform"
                onClick={(e) => e.stopPropagation()}
              >
                <Play size={24} fill="black" />
              </Link>
              {isShow && (
                <Link
                  to={linkPath}
                  className="bg-gray-600/80 rounded-full p-3 text-white hover:scale-110 transition-transform"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info size={24} />
                </Link>
              )}
            </div>
            </div>
          </div>
        </Link>
      )}

      {/* Info below poster */}
      <div className="bg-netflix-dark p-3">
        <h3 className="text-sm font-medium text-white truncate">{item.title}</h3>
        <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
          {isShow ? (
            <span>{item.episodeCount} episode{item.episodeCount !== 1 ? 's' : ''}</span>
          ) : (
            <>
              {item._isEpisode ? (
                <div className="flex flex-col">
                  <span className="truncate">{item._showTitle || item.title}</span>
                  {item._season && item._episode && (
                    <span className="text-[0.7rem] text-gray-500">
                      S{String(item._season).padStart(2, '0')} • E{String(item._episode).padStart(2, '0')}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {item.year && (
                    <span className="flex items-center">
                      <Calendar size={10} className="mr-1" />
                      {item.year}
                    </span>
                  )}
                  {item.sizeFormatted && (
                    <span className="flex items-center">
                      <HardDrive size={10} className="mr-1" />
                      {item.sizeFormatted}
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MediaCard;
