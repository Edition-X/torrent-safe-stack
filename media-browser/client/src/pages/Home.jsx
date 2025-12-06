import React, { useMemo, useState, useEffect } from 'react';
import { useMediaLibrary, useContinueWatching, useWatchHistory, fetchSeasonEpisodes } from '../hooks/useApi';
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

// Try to extract season/episode numbers from a path or title
function extractEpisodeInfo(path, title) {
  const source = `${title || ''} ${path || ''}`;

  let match = source.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
  if (match) {
    return {
      season: parseInt(match[1], 10),
      episode: parseInt(match[2], 10)
    };
  }

  match = source.match(/(\d{1,2})x(\d{1,2})/);
  if (match) {
    return {
      season: parseInt(match[1], 10),
      episode: parseInt(match[2], 10)
    };
  }

  return { season: null, episode: null };
}

function extractEpisodeTitleFromFilename(rawTitle) {
  if (!rawTitle) return '';
  const base = rawTitle.replace(/\.[^/.]+$/, '');
  const match = base.match(/^(.*?)[._\s-]*(S\d{1,2}E\d{1,2}|\d{1,2}x\d{1,2})[._\s-]*(.*)$/i);
  if (match && match[3]) {
    let ep = match[3];
    // Remove brackets and their contents first
    ep = ep.replace(/\[.*?\]/g, '');
    // Remove quality indicators and everything after (can start at beginning or after separator)
    ep = ep.replace(/^[._\s-]*(720p|1080p|2160p|4K|HDTV|WEB|BluRay|HEVC|x265|x264|AAC|DDP|HDR|SDR).*/gi, '');
    ep = ep.replace(/[._\s-]+(720p|1080p|2160p|4K|HDTV|WEB|BluRay|HEVC|x265|x264|AAC|DDP|HDR|SDR).*/gi, '');
    // Replace dots/underscores with spaces
    ep = ep.replace(/[._]/g, ' ');
    ep = ep.trim();
    // If what's left is empty or just whitespace/dashes, there's no real episode name
    if (!ep || /^[\s-]*$/.test(ep)) return '';
    return ep;
  }
  return '';
}

function Home() {
  const { data, loading, error } = useMediaLibrary();
  const { data: continueWatching, loading: continueLoading } = useContinueWatching();
  const [randomIndex, setRandomIndex] = useState(null);
  const { data: watchHistory } = useWatchHistory();
  const [tmdbEpisodeNames, setTmdbEpisodeNames] = useState({}); // { "showTitle:season:episode": "Episode Name" }

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
      // Detect if this looks like a TV episode and extract season/episode
      const { season, episode } = extractEpisodeInfo(continueWatching.path, continueWatching.title);
      const looksLikeEpisode =
        season != null || episode != null || /[Ss]\d{1,2}[Ee]\d{1,2}/.test(continueWatching.path);
      
      // Extract episode name from the saved title (Player saves the clean episode name)
      // or fall back to extracting from filename
      const filename = continueWatching.path.split(/[\\/]/).pop() || '';
      const episodeNameFromFilename = extractEpisodeTitleFromFilename(filename);
      // If the saved title looks like a clean episode name (no dots, no SxxEyy, no quality tags), use it
      const savedTitleLooksClean = continueWatching.title &&
        !continueWatching.title.includes('.') &&
        !/S\d{1,2}E\d{1,2}/i.test(continueWatching.title) &&
        !/\d{1,2}x\d{1,2}/.test(continueWatching.title) &&
        !/\b(720p|1080p|2160p|4K|HDTV|WEB|BluRay|HEVC|x265|x264)\b/i.test(continueWatching.title);
      const episodeName = savedTitleLooksClean
        ? continueWatching.title
        : (episodeNameFromFilename || null);
      
      return {
        title: displayTitle,
        path: continueWatching.path,
        year: continueWatching.year,
        _type: looksLikeEpisode ? 'tv' : 'movie',
        _continueWatching: true,
        _progress: continueWatching.progress,
        _currentTime: continueWatching.currentTime,
        _duration: continueWatching.duration,
        _season: continueWatching.season != null ? continueWatching.season : season,
        _episode: continueWatching.episode != null ? continueWatching.episode : episode,
        _episodeName: looksLikeEpisode ? episodeName : null
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

    // Build lookup maps for movies and TV episodes
    const moviesByPath = new Map();
    const episodesByPath = new Map();
    if (data?.movies) {
      for (const movie of data.movies) {
        moviesByPath.set(movie.path, movie);
      }
    }
    if (data?.tvShows) {
      for (const show of data.tvShows) {
        for (const season of (show.seasons || [])) {
          for (const ep of (season.episodes || [])) {
            episodesByPath.set(ep.path, { episode: ep, show, season });
          }
        }
      }
    }

    const seenPaths = new Set();
    const items = [];

    // Walk history in order (assuming most-recent-first from backend)
    for (const h of watchHistory) {
      if (!h?.path || seenPaths.has(h.path)) continue;
      seenPaths.add(h.path);

      const existingMovie = moviesByPath.get(h.path);
      const existingEpisode = episodesByPath.get(h.path);

      if (existingMovie) {
        // Use current library metadata for movies
        items.push(existingMovie);
      } else if (existingEpisode) {
        // TV episode still in library - create a card with TMDB episode name
        const { episode: ep, show, season: seasonData } = existingEpisode;
        const cacheKey = `${show.title}:${seasonData.seasonNumber}:${ep.episodeNumber}`;
        const tmdbName = tmdbEpisodeNames[cacheKey];
        const episodeTitle = tmdbName || ep.title || `Episode ${ep.episodeNumber}`;
        items.push({
          id: `history-${encodeURIComponent(h.path)}`,
          title: episodeTitle,
          type: 'movie',
          year: show.year || null,
          quality: ep.quality || null,
          path: h.path,
          sizeFormatted: ep.sizeFormatted || null,
          _isEpisode: true,
          _showTitle: show.title,
          _episodeName: tmdbName || ep.title || null,
          _season: seasonData.seasonNumber,
          _episode: ep.episodeNumber
        });
      } else {
        // Create a stub item for entries that are no longer in the library
        const filename = h.path.split(/[\\/]/).pop() || '';
        const { season, episode } = extractEpisodeInfo(h.path, filename);
        const isEpisode = h.type === 'episode' || (season != null && episode != null);

        // For the show title, always derive from filename (the part before SxxEyy)
        const showTitleFromFilename = cleanTitle(filename);
        const showTitle = h.showTitle ? cleanTitle(h.showTitle) : showTitleFromFilename;

        // For the episode title, prefer what's saved in history if it looks like a clean episode name,
        // otherwise extract from filename (the part after SxxEyy)
        let episodeName = null;
        if (isEpisode) {
          const episodeFromFilename = extractEpisodeTitleFromFilename(filename);
          // Only use h.title if it doesn't look like a full filename or quality tags
          const historyTitleLooksClean = h.title && 
            !h.title.includes('.') && 
            !/S\d{1,2}E\d{1,2}/i.test(h.title) &&
            !/\d{1,2}x\d{1,2}/.test(h.title) &&
            !/\b(720p|1080p|2160p|4K|HDTV|WEB|BluRay|HEVC|x265|x264)\b/i.test(h.title);
          episodeName = historyTitleLooksClean ? h.title : (episodeFromFilename || null);
        }

        // Check TMDB cache for episode name
        const cacheKey = isEpisode ? `${showTitle}:${h.season != null ? h.season : season}:${h.episode != null ? h.episode : episode}` : null;
        const tmdbName = cacheKey ? tmdbEpisodeNames[cacheKey] : null;
        const finalEpisodeName = tmdbName || episodeName;

        // For the card title: use TMDB name, then episode name, then "Episode X"
        const cardTitle = isEpisode 
          ? (finalEpisodeName || `Episode ${episode}`)
          : cleanTitle(filename);

        items.push({
          id: `history-${encodeURIComponent(h.path)}`,
          title: cardTitle,
          type: 'movie',
          year: h.year || null,
          quality: null,
          path: h.path,
          sizeFormatted: null,
          // Extra metadata for TV episodes so cards can show season/episode nicely
          _isEpisode: isEpisode,
          _showTitle: showTitle,
          _episodeName: finalEpisodeName,
          _season: h.season != null ? h.season : season,
          _episode: h.episode != null ? h.episode : episode
        });
      }

      if (items.length >= 20) break;
    }

    return items;
  }, [watchHistory, data, tmdbEpisodeNames]);

  // Fetch TMDB episode names for TV episodes in Previously Watched
  useEffect(() => {
    if (!previouslyWatchedMovies.length) return;

    // Find unique show+season combinations that need TMDB data
    const toFetch = new Map(); // "showTitle:season" -> [{ item, episodeNumber }]
    for (const item of previouslyWatchedMovies) {
      if (!item._isEpisode || !item._showTitle || !item._season) continue;
      // Skip if we already have the name or it's not "Episode X"
      if (item._episodeName && !/^Episode \d+$/.test(item._episodeName)) continue;
      if (item.title && !/^Episode \d+$/.test(item.title)) continue;
      
      const key = `${item._showTitle}:${item._season}`;
      const cacheKey = `${item._showTitle}:${item._season}:${item._episode}`;
      if (tmdbEpisodeNames[cacheKey]) continue; // Already fetched
      
      if (!toFetch.has(key)) toFetch.set(key, []);
      toFetch.get(key).push({ item, episodeNumber: item._episode });
    }

    if (toFetch.size === 0) return;

    // Fetch TMDB data for each show+season
    for (const [key, episodes] of toFetch) {
      const [showTitle, seasonStr] = key.split(':');
      const season = parseInt(seasonStr, 10);
      
      fetchSeasonEpisodes(showTitle, season).then(data => {
        if (!data?.episodes) return;
        
        const newNames = {};
        for (const { episodeNumber } of episodes) {
          const tmdbEp = data.episodes.find(e => e.episodeNumber === episodeNumber);
          if (tmdbEp?.name) {
            newNames[`${showTitle}:${season}:${episodeNumber}`] = tmdbEp.name;
          }
        }
        
        if (Object.keys(newNames).length > 0) {
          setTmdbEpisodeNames(prev => ({ ...prev, ...newNames }));
        }
      }).catch(() => {}); // Ignore errors
    }
  }, [previouslyWatchedMovies, tmdbEpisodeNames]);

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
