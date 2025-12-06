import React, { useEffect } from 'react';
import { Download, ExternalLink, HardDrive, Zap } from 'lucide-react';

function Downloads() {
  // Open qBittorrent directly - it works best in its own tab
  const qbitUrl = 'http://localhost:8080';

  // Auto-open qBittorrent in new tab on first load
  useEffect(() => {
    // Small delay to let the page render first
    const timeout = setTimeout(() => {
      window.open(qbitUrl, 'qbittorrent');
    }, 500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="pt-16 min-h-screen bg-netflix-black">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <Download size={64} className="mx-auto text-netflix-red mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Download Manager</h1>
          <p className="text-gray-400">
            qBittorrent should have opened in a new tab. If not, click the button below.
          </p>
        </div>

        <div className="flex justify-center mb-12">
          <a
            href={qbitUrl}
            target="qbittorrent"
            rel="noopener noreferrer"
            className="flex items-center space-x-3 bg-netflix-red hover:bg-red-700 text-white px-8 py-4 rounded-lg transition-colors text-lg font-medium"
          >
            <span>Open qBittorrent</span>
            <ExternalLink size={20} />
          </a>
        </div>

        <div className="grid md:grid-cols-2 gap-6 text-gray-300">
          <div className="bg-gray-800/50 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <HardDrive className="text-netflix-red" size={24} />
              <h3 className="text-lg font-medium text-white">Downloads Location</h3>
            </div>
            <p className="text-sm">
              Files are saved to <code className="bg-gray-700 px-2 py-1 rounded">/downloads</code>
            </p>
            <p className="text-sm mt-2 text-gray-400">
              New media will appear in DanFlix after the library refreshes.
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-3">
              <Zap className="text-netflix-red" size={24} />
              <h3 className="text-lg font-medium text-white">Quick Tips</h3>
            </div>
            <ul className="text-sm space-y-1">
              <li>• Add torrents via magnet links or .torrent files</li>
              <li>• Downloaded media auto-appears in your library</li>
              <li>• Use the search to find content in DanFlix</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Downloads;
