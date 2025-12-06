import React, { useMemo } from 'react';
import { useMovies, useWatchHistory } from '../hooks/useApi';
import MediaCard from '../components/MediaCard';
import Loading from '../components/Loading';

function Movies() {
  const { data: movies, loading, error } = useMovies();
  const { data: watchHistory } = useWatchHistory();

  const historyByPath = useMemo(() => {
    const map = {};
    if (!watchHistory) return map;
    for (const item of watchHistory) {
      if (item && item.path) {
        map[item.path] = item;
      }
    }
    return map;
  }, [watchHistory]);

  if (loading) return <Loading message="Loading movies..." />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] pt-16">
        <p className="text-red-500 text-lg">Failed to load movies</p>
        <p className="text-gray-400 mt-2">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 px-4 sm:px-8">
      <h1 className="text-3xl font-bold text-white mb-8">Movies</h1>

      {movies.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">No movies found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {movies.map((movie) => (
            <MediaCard
              key={movie.id}
              item={movie}
              type="movie"
              historyEntry={historyByPath ? historyByPath[movie.path] : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default Movies;
