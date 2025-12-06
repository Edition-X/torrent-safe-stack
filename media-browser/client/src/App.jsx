import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import TvShows from './pages/TvShows';
import Movies from './pages/Movies';
import Player from './pages/Player';
import ShowDetails from './pages/ShowDetails';
import Search from './pages/Search';
import Downloads from './pages/Downloads';

function App() {
  const location = useLocation();
  const isPlayerRoute = location.pathname.startsWith('/play');

  return (
    <div className="min-h-screen bg-netflix-black">
      {!isPlayerRoute && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tv" element={<TvShows />} />
        <Route path="/tv/:id" element={<ShowDetails />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/search" element={<Search />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/play/*" element={<Player />} />
      </Routes>
    </div>
  );
}

export default App;
