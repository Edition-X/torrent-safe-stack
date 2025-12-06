import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useSearch } from '../hooks/useApi';
import MediaCard from '../components/MediaCard';
import Loading from '../components/Loading';

function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const { data, loading } = useSearch(query);

  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    if (urlQuery !== query) {
      setQuery(urlQuery);
    }
  }, [searchParams]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
    }
  };

  const totalResults = (data.tvShows?.length || 0) + (data.movies?.length || 0);

  return (
    <div className="min-h-screen pt-20 px-4 sm:px-8">
      {/* Search form */}
      <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8">
        <div className="relative">
          <SearchIcon
            size={24}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search TV shows and movies..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-12 pr-4 py-4 text-white placeholder-gray-400 focus:outline-none focus:border-netflix-red transition-colors"
          />
        </div>
      </form>

      {/* Results */}
      {loading ? (
        <Loading message="Searching..." />
      ) : query.length < 2 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">Enter at least 2 characters to search</p>
        </div>
      ) : totalResults === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">No results found for "{query}"</p>
        </div>
      ) : (
        <>
          <p className="text-gray-400 mb-6">
            Found {totalResults} result{totalResults !== 1 ? 's' : ''} for "{query}"
          </p>

          {/* TV Shows */}
          {data.tvShows?.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4">TV Shows</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {data.tvShows.map((show) => (
                  <MediaCard key={show.id} item={show} type="tv" />
                ))}
              </div>
            </div>
          )}

          {/* Movies */}
          {data.movies?.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">Movies</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {data.movies.map((movie) => (
                  <MediaCard key={movie.id} item={movie} type="movie" />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Search;
