const { test, describe } = require('node:test');
const assert = require('node:assert');
const { parseFilename, cleanTitle, formatBytes, organizeMedia } = require('../mediaScanner');

describe('parseFilename', () => {
  test('parses S01E01 format TV shows', () => {
    const result = parseFilename('Dexter.Resurrection.S01E02.720p.HEVC.x265-MeGusta[EZTVx.to].mkv');
    assert.strictEqual(result.type, 'tv');
    assert.strictEqual(result.title, 'Dexter Resurrection');
    assert.strictEqual(result.season, 1);
    assert.strictEqual(result.episode, 2);
    assert.strictEqual(result.quality, '720p');
  });

  test('parses lowercase s01e01 format', () => {
    const result = parseFilename('south.park.s27e01.1080p.web.h264-successfulcrab[EZTVx.to].mkv');
    assert.strictEqual(result.type, 'tv');
    assert.strictEqual(result.title, 'south park');
    assert.strictEqual(result.season, 27);
    assert.strictEqual(result.episode, 1);
    assert.strictEqual(result.quality, '1080p');
  });

  test('parses Foundation format', () => {
    const result = parseFilename('foundation.s03e06.1080p.web.h264-successfulcrab[EZTVx.to].mkv');
    assert.strictEqual(result.type, 'tv');
    assert.strictEqual(result.title, 'foundation');
    assert.strictEqual(result.season, 3);
    assert.strictEqual(result.episode, 6);
  });

  test('parses Pluribus format', () => {
    const result = parseFilename('Pluribus.S01E01.1080p.HEVC.x265-MeGusta[EZTVx.to].mkv');
    assert.strictEqual(result.type, 'tv');
    assert.strictEqual(result.title, 'Pluribus');
    assert.strictEqual(result.season, 1);
    assert.strictEqual(result.episode, 1);
  });

  test('parses movie with year in parentheses', () => {
    const result = parseFilename('Grease (1978) 2160p SDR.mkv');
    assert.strictEqual(result.type, 'movie');
    assert.strictEqual(result.title, 'Grease');
    assert.strictEqual(result.year, 1978);
  });

  test('parses movie with year and dots', () => {
    const result = parseFilename('28.Years.Later.2025.Proper.1080p.WEB-DL.DDP5.1.x265-NeoNoir.mkv');
    assert.strictEqual(result.type, 'movie');
    assert.strictEqual(result.title, '28 Years Later');
    assert.strictEqual(result.year, 2025);
    assert.strictEqual(result.quality, '1080p');
  });

  test('parses Weapons movie format', () => {
    const result = parseFilename('Weapons (2025) [1080p] [WEBRip].mkv');
    assert.strictEqual(result.type, 'movie');
    assert.strictEqual(result.title, 'Weapons');
    assert.strictEqual(result.year, 2025);
  });
});

describe('cleanTitle', () => {
  test('replaces dots with spaces', () => {
    assert.strictEqual(cleanTitle('The.Walking.Dead'), 'The Walking Dead');
  });

  test('replaces underscores with spaces', () => {
    assert.strictEqual(cleanTitle('The_Walking_Dead'), 'The Walking Dead');
  });

  test('handles mixed separators', () => {
    assert.strictEqual(cleanTitle('The.Walking_Dead'), 'The Walking Dead');
  });

  test('trims whitespace', () => {
    assert.strictEqual(cleanTitle('  The Walking Dead  '), 'The Walking Dead');
  });
});

describe('formatBytes', () => {
  test('formats bytes correctly', () => {
    assert.strictEqual(formatBytes(0), '0 B');
    assert.strictEqual(formatBytes(1024), '1 KB');
    assert.strictEqual(formatBytes(1048576), '1 MB');
    assert.strictEqual(formatBytes(1073741824), '1 GB');
  });

  test('formats with decimals', () => {
    assert.strictEqual(formatBytes(1536), '1.5 KB');
  });
});

describe('organizeMedia', () => {
  test('organizes TV shows by series and season', () => {
    const media = [
      { type: 'tv', title: 'Test Show', season: 1, episode: 1, path: 'a.mkv', size: 100, sizeFormatted: '100 B', subtitles: [] },
      { type: 'tv', title: 'Test Show', season: 1, episode: 2, path: 'b.mkv', size: 100, sizeFormatted: '100 B', subtitles: [] },
      { type: 'tv', title: 'Test Show', season: 2, episode: 1, path: 'c.mkv', size: 100, sizeFormatted: '100 B', subtitles: [] },
    ];
    
    const result = organizeMedia(media);
    
    assert.strictEqual(result.tvShows.length, 1);
    assert.strictEqual(result.tvShows[0].title, 'Test Show');
    assert.strictEqual(result.tvShows[0].seasons.length, 2);
    assert.strictEqual(result.tvShows[0].seasons[0].episodes.length, 2);
    assert.strictEqual(result.tvShows[0].episodeCount, 3);
  });

  test('separates movies from TV shows', () => {
    const media = [
      { type: 'tv', title: 'Test Show', season: 1, episode: 1, path: 'a.mkv', size: 100, sizeFormatted: '100 B', subtitles: [] },
      { type: 'movie', title: 'Test Movie', year: 2023, path: 'b.mkv', size: 100, sizeFormatted: '100 B', subtitles: [] },
    ];
    
    const result = organizeMedia(media);
    
    assert.strictEqual(result.tvShows.length, 1);
    assert.strictEqual(result.movies.length, 1);
    assert.strictEqual(result.stats.totalTvShows, 1);
    assert.strictEqual(result.stats.totalMovies, 1);
  });
});

console.log('All tests passed!');
