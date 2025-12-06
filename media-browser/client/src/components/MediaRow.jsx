import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard from './MediaCard';

function MediaRow({ title, items, type = 'movie', historyByPath }) {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="relative group/row mb-8">
      <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 px-4 sm:px-8">
        {title}
      </h2>

      {/* Scroll buttons */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-2 rounded-r-lg opacity-0 group-hover/row:opacity-100 transition-opacity hidden sm:block"
        style={{ marginTop: '20px' }}
      >
        <ChevronLeft size={28} />
      </button>

      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white p-2 rounded-l-lg opacity-0 group-hover/row:opacity-100 transition-opacity hidden sm:block"
        style={{ marginTop: '20px' }}
      >
        <ChevronRight size={28} />
      </button>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="scroll-container flex space-x-4 overflow-x-auto px-4 sm:px-8 pb-4"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {items.map((item, index) => (
          <div key={item.id || index} style={{ scrollSnapAlign: 'start' }}>
            <MediaCard
              item={item}
              type={type}
              // Only show per-card progress bar for movies; TV progress is shown per-episode
              historyEntry={type === 'movie' && historyByPath ? historyByPath[item.path] : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default MediaRow;
