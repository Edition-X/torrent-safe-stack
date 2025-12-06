import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Play, ChevronDown, ChevronUp, HardDrive, Subtitles, Star, Clock } from 'lucide-react';
import { useTvShow, fetchTvDetails, fetchSeasonEpisodes } from '../hooks/useApi';
import Loading from '../components/Loading';

function ShowDetails() {
  const { id } = useParams();
  const { data: show, loading, error } = useTvShow(id);
  const [expandedSeason, setExpandedSeason] = useState(null);
  
  // TMDB metadata
  const [tmdbDetails, setTmdbDetails] = useState(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState({}); // { seasonNumber: episodesData }
  const [backdropLoaded, setBackdropLoaded] = useState(false);

  // Fetch TMDB details when show loads
  useEffect(() => {
    if (!show?.title) return;
    
    setBackdropLoaded(false);
    fetchTvDetails(show.title).then(details => {
      if (details) {
        setTmdbDetails(details);
      }
    });
  }, [show?.title]);

  // Fetch season episodes when a season is expanded
  useEffect(() => {
    if (expandedSeason === null || !show?.title) return;
    
    // Already fetched?
    if (seasonEpisodes[expandedSeason]) return;
    
    fetchSeasonEpisodes(show.title, expandedSeason).then(data => {
      if (data) {
        setSeasonEpisodes(prev => ({
          ...prev,
          [expandedSeason]: data
        }));
      }
    });
  }, [expandedSeason, show?.title, seasonEpisodes]);

  if (loading) return <Loading message="Loading show details..." />;

  if (error || !show) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] pt-16">
        <p className="text-red-500 text-lg">Show not found</p>
        <Link to="/tv" className="text-netflix-red mt-4 hover:underline">
          Back to TV Shows
        </Link>
      </div>
    );
  }

  // Get gradient colors
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

  const toggleSeason = (seasonNumber) => {
    setExpandedSeason(expandedSeason === seasonNumber ? null : seasonNumber);
  };

  // Get first episode for play button
  const firstEpisode = show.seasons?.[0]?.episodes?.[0];

  return (
    <div className="min-h-screen">
      {/* Hero section with backdrop */}
      <div className={`relative h-[60vh] min-h-[400px] bg-gradient-to-br ${getGradient(show.title)}`}>
        {/* Backdrop image */}
        {tmdbDetails?.backdropPath && (
          <img
            src={tmdbDetails.backdropPath}
            alt=""
            onLoad={() => setBackdropLoaded(true)}
            loading="eager"
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${
              backdropLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-netflix-black via-netflix-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-netflix-black/90 via-netflix-black/50 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">{show.title}</h1>
          
          {/* Meta info row */}
          <div className="flex flex-wrap items-center gap-3 text-gray-300 mb-4">
            {tmdbDetails?.rating > 0 && (
              <span className="flex items-center bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                <Star size={14} className="mr-1" fill="currentColor" />
                {tmdbDetails.rating.toFixed(1)}
              </span>
            )}
            {tmdbDetails?.firstAirDate && (
              <span>{new Date(tmdbDetails.firstAirDate).getFullYear()}</span>
            )}
            <span>{show.seasons?.length || 0} Season{show.seasons?.length !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{show.episodeCount || 0} Episode{show.episodeCount !== 1 ? 's' : ''}</span>
            {tmdbDetails?.genres?.length > 0 && (
              <>
                <span>•</span>
                <span>{tmdbDetails.genres.slice(0, 3).join(', ')}</span>
              </>
            )}
          </div>

          {/* Overview */}
          {tmdbDetails?.overview && (
            <p className="text-gray-300 mb-6 max-w-3xl line-clamp-3">
              {tmdbDetails.overview}
            </p>
          )}

          {firstEpisode && (
            <Link
              to={`/play/${encodeURIComponent(firstEpisode.path)}`}
              className="inline-flex items-center space-x-2 bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              <Play size={24} fill="black" />
              <span>Play S1 E1</span>
            </Link>
          )}
        </div>
      </div>

      {/* Episodes section */}
      <div className="px-4 sm:px-8 py-8 -mt-8 relative z-10">
        <h2 className="text-2xl font-semibold text-white mb-6">Episodes</h2>

        {show.seasons?.map((season) => (
          <div key={season.seasonNumber} className="mb-4">
            {/* Season header */}
            <button
              onClick={() => toggleSeason(season.seasonNumber)}
              className="w-full flex items-center justify-between bg-netflix-dark hover:bg-gray-800 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <span className="text-lg font-medium text-white">
                  {season.seasonNumber === 0 ? 'Specials' : `Season ${season.seasonNumber}`}
                </span>
                <span className="text-gray-400 text-sm">
                  {season.episodes.length} episode{season.episodes.length !== 1 ? 's' : ''}
                </span>
              </div>
              {expandedSeason === season.seasonNumber ? (
                <ChevronUp size={24} className="text-gray-400" />
              ) : (
                <ChevronDown size={24} className="text-gray-400" />
              )}
            </button>

            {/* Episodes list - Netflix style */}
            {expandedSeason === season.seasonNumber && (
              <div className="mt-4 space-y-4">
                {season.episodes.map((episode) => {
                  // Get TMDB episode metadata if available
                  const tmdbEp = seasonEpisodes[season.seasonNumber]?.episodes?.find(
                    e => e.episodeNumber === episode.episodeNumber
                  );
                  
                  return (
                    <Link
                      key={episode.episodeNumber}
                      to={`/play/${encodeURIComponent(episode.path)}`}
                      className="flex gap-4 bg-gray-900/50 hover:bg-gray-800 rounded-lg overflow-hidden transition-colors group"
                    >
                      {/* Episode thumbnail */}
                      <div className="relative w-40 sm:w-52 flex-shrink-0 aspect-video bg-gray-800">
                        {tmdbEp?.stillPath ? (
                          <img
                            src={tmdbEp.stillPath}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                            <Play size={24} className="text-gray-500" />
                          </div>
                        )}
                        {/* Play overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                            <Play size={24} className="text-black ml-1" fill="black" />
                          </div>
                        </div>
                        {/* Runtime badge */}
                        {tmdbEp?.runtime && (
                          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                            {tmdbEp.runtime}m
                          </div>
                        )}
                      </div>
                      
                      {/* Episode info */}
                      <div className="flex-1 py-3 pr-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-white font-medium">
                              {episode.episodeNumber}. {tmdbEp?.name || `Episode ${episode.episodeNumber}`}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mt-1">
                              {episode.quality && (
                                <span className="bg-gray-700 px-2 py-0.5 rounded text-xs">
                                  {episode.quality}
                                </span>
                              )}
                              <span className="flex items-center">
                                <HardDrive size={12} className="mr-1" />
                                {episode.sizeFormatted}
                              </span>
                              {episode.subtitles?.length > 0 && (
                                <span className="flex items-center text-green-400">
                                  <Subtitles size={12} className="mr-1" />
                                  Subs
                                </span>
                              )}
                              {tmdbEp?.rating > 0 && (
                                <span className="flex items-center text-yellow-400">
                                  <Star size={12} className="mr-1" fill="currentColor" />
                                  {tmdbEp.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Episode description */}
                        {tmdbEp?.overview && (
                          <p className="text-gray-400 text-sm mt-2 line-clamp-2">
                            {tmdbEp.overview}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ShowDetails;
