import { parseYouTubePlaylistId } from './youtube-data.service';

describe('parseYouTubePlaylistId', () => {
  const playlistId = `PL${'a'.repeat(32)}`;

  it('accepts a bare playlist id', () => {
    expect(parseYouTubePlaylistId(playlistId)).toBe(playlistId);
  });

  it('accepts a playlist URL', () => {
    expect(
      parseYouTubePlaylistId(
        `https://www.youtube.com/playlist?list=${playlistId}`,
      ),
    ).toBe(playlistId);
  });

  it('accepts a watch URL with a list parameter', () => {
    expect(
      parseYouTubePlaylistId(
        `https://www.youtube.com/watch?v=aaaaaaaaaaa&list=${playlistId}`,
      ),
    ).toBe(playlistId);
  });

  it('accepts a music.youtube.com URL', () => {
    expect(
      parseYouTubePlaylistId(
        `https://music.youtube.com/playlist?list=${playlistId}`,
      ),
    ).toBe(playlistId);
  });

  it('rejects another host', () => {
    expect(
      parseYouTubePlaylistId(`https://example.com/playlist?list=${playlistId}`),
    ).toBeNull();
  });

  it('rejects a URL without a list parameter', () => {
    expect(
      parseYouTubePlaylistId('https://www.youtube.com/watch?v=aaaaaaaaaaa'),
    ).toBeNull();
  });

  it('rejects a malformed id', () => {
    expect(parseYouTubePlaylistId('too-short')).toBeNull();
  });
});
