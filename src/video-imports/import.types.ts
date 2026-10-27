/** One warning or error produced by an import run. */
export interface ImportIssue {
  youtubeVideoId?: string;
  channelId?: string;
  playlistId?: string;
  reason: string;
}
