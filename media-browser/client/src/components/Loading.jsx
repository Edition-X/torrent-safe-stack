import React from 'react';
import { Loader2 } from 'lucide-react';

function Loading({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 size={48} className="spinner text-netflix-red mb-4" />
      <p className="text-gray-400">{message}</p>
    </div>
  );
}

export default Loading;
