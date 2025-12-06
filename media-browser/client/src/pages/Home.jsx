import React, { useMemo, useState, useEffect } from 'react';
import { useMediaLibrary, useContinueWatching, useWatchHistory } from '../hooks/useApi';
import HeroBanner from '../components/HeroBanner';
import MediaRow from '../components/MediaRow';
import Loading from '../components/Loading';

// Extract clean show/movie title from filename
function cleanTitle(rawTitle) {
  if (!rawTitle) return '';
  // Remove episode info (S01E01, 1x01, etc)
  let title = rawTitle.replace(/[._]?[Ss]\d{1,2}[Ee]\d{1,2}.*/i, '');
  title = title.replace(/[._]?\d{1,2}x\d{1,2}.*/i, '');
  // Remove year in parentheses
  title = title.replace(/\s*\(\d{4}\)\s*/g, ' ');
  // Remove quality indicators
  title = title.replace(/\b(720p|1080p|2160p|4K|HDTV|WEB|BluRay|HEVC|x265|x264|AAC|DDP|HDR|SDR)\b.*/gi, '');
  // Replace dots/underscores with spaces
  title = title.replace(/[._]/g, ' ');
  // Remove brackets and their contents
  title = title.replace(/\[.*?\]/g, '');
  // Clean up whitespace
  return title.trim();
}

function Home() {
  const { data, loading, error } = useMediaLibrary();
  const { data: continueWatching, loading: continueLoading } = useContinueWatching();
  const [randomIndex, setRandomIndex] = useState(null);
  const { data: watchHistory } = useWatchHistory();

  // Generate random index once when data loads
  useEffect(() => {
    if (data && randomIndex === null) {
      const totalItems = data.tvShows.length + data.movies.length;
      if (totalItems > 0) {
        setRandomIndex(Math.floor(Math.random() * totalItems));
      }
    }
  }, [data, randomIndex]);

  // Use continue watching for hero, or pick a stable random item
  const featured = useMemo(() => {
    // If we have something to continue watching, use that
    if (continueWatching) {
      // Use showTitle if available, otherwise clean the raw title
      const displayTitle = continueWatching.showTitle || cleanTitle(continueWatching.title);
      // Detect if this looks like a TV episode
      const looksLikeEpisode = /[Ss]\d{1,2}[Ee]\d{1,2}/.test(continueWatching.path);
      
      return {
        title: displayTitle,
        path: continueWatching.path,
        year: continueWatching.year,
        _type: looksLikeEpisode ? 'tv' : 'movie',
        _continueWatching: true,
        _progress: continueWatching.progress,
        _currentTime: continueWatching.currentTime,
        _duration: continueWatching.duration
      };
    }
    
    // Otherwise pick a stable random item (based on randomIndex state)
    if (!data || randomIndex === null) return null;
    const allItems = [
      ...data.tvShows.map(s => ({ ...s, _type: 'tv' })),
      ...data.movies.map(m => ({ ...m, _type: 'movie' }))
    ];
    if (allItems.length === 0) return null;
    return allItems[randomIndex % allItems.length];
  }, [data, continueWatching, randomIndex]);

  // Get recently added (by modification date would be ideal, but we'll just show recent items)
  const recentMovies = useMemo(() => {
    if (!data) return [];
    return data.movies.slice(0, 10);
  }, [data]);

  const recentShows = useMemo(() => {
    if (!data) return [];
    return data.tvShows.slice(0, 10);
  }, [data]);

  // Build a quick lookup of watch history by path
  const historyByPath = useMemo(() => {
    const map = {};
    if (!watchHistory) return map;
    for (const item of watchHistory) {
      if (item?.path) {
        map[item.path] = item;
      }
    }
    return map;
  }, [watchHistory]);

  // Build a "Previously Watched" movies list (including unavailable items)
  const previouslyWatchedMovies = useMemo(() => {
    if (!watchHistory) return [];

    const moviesByPath = new Map();
    if (data?.movies) {
      for (const movie of data.movies) {
        moviesByPath.set(movie.path, movie);
      }
    }

    const seenPaths = new Set();
    const items = [];

    // Walk history in order (assuming most-recent-first from backend)
    for (const h of watchHistory) {
      if (!h?.path || seenPaths.has(h.path)) continue;
      seenPaths.add(h.path);

      // Only include entries that look like movies (episodes will be visualized on the show page)
      if (h.type && h.type !== 'movie') continue;

      const existing = moviesByPath.get(h.path);

      if (existing) {
        // Use current library metadata
        items.push(existing);
      } else {
        // Create a stub item for movies that are no longer in the library
        const title = h.title || h.path.split(/[\\/]/).pop();
        items.push({
          id: `history-${encodeURIComponent(h.path)}`,
          title,
          type: 'movie',
          year: h.year || null,
          quality: null,
          path: h.path,
          sizeFormatted: null
        });
      }

      if (items.length >= 20) break;
    }

    return items;
  }, [watchHistory, data]);

  if (loading) return <Loading message="Loading your library..." />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] pt-16">
        <p className="text-red-500 text-lg">Failed to load media library</p>
        <p className="text-gray-400 mt-2">{error.message}</p>
      </div>
    );
  }

  if (!data || (data.tvShows.length === 0 && data.movies.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] pt-16">
        <p className="text-gray-400 text-lg">No media found in your library</p>
        <p className="text-gray-500 mt-2">Add some videos to your downloads folder</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Banner */}
      {featured && (
        <HeroBanner item={featured} type={featured._type} />
      )}

      {/* Content rows */}
      <div className="-mt-16 relative z-10 pt-4">
        {recentShows.length > 0 && (
          <MediaRow title="TV Shows" items={recentShows} type="tv" />
        )}

        {recentMovies.length > 0 && (
          <MediaRow
            title="Movies"
            items={recentMovies}
            type="movie"
            historyByPath={historyByPath}
          />
        )}

        {previouslyWatchedMovies.length > 0 && (
          <MediaRow
            title="Previously Watched"
            items={previouslyWatchedMovies}
            type="movie"
            historyByPath={historyByPath}
          />
        )}

        {/* Stats footer */}
        <div className="text-center py-8 text-gray-500">
          <p>
            {data.stats.totalTvShows} TV Show{data.stats.totalTvShows !== 1 ? 's' : ''}
            {' • '}
            {data.stats.totalEpisodes} Episode{data.stats.totalEpisodes !== 1 ? 's' : ''}
            {' • '}
            {data.stats.totalMovies} Movie{data.stats.totalMovies !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Home;
