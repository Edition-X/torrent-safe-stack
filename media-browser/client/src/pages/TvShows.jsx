import React from 'react';
import { useTvShows } from '../hooks/useApi';
import MediaCard from '../components/MediaCard';
import Loading from '../components/Loading';

function TvShows() {
  const { data: shows, loading, error } = useTvShows();

  if (loading) return <Loading message="Loading TV shows..." />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] pt-16">
        <p className="text-red-500 text-lg">Failed to load TV shows</p>
        <p className="text-gray-400 mt-2">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 px-4 sm:px-8">
      <h1 className="text-3xl font-bold text-white mb-8">TV Shows</h1>

      {shows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">No TV shows found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {shows.map((show) => (
            <MediaCard key={show.id} item={show} type="tv" />
          ))}
        </div>
      )}
    </div>
  );
}

export default TvShows;
