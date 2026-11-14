export interface CoreSettings {
  ebookRoot: string;
  audiobookRoot: string;
  importMode: 'hardlink' | 'copy' | 'move';
  folderPattern: string;
  fileNamePattern: string;
  ebookFormats: string;
  audiobookFormats: string;
  minSeeders: number;
  metadataProvider: string;
  searchOnAdd: boolean;
  rssIntervalMinutes: number;
  language: string;
}

export const defaultSettings: CoreSettings = {
  ebookRoot: '/books',
  audiobookRoot: '/audiobooks',
  importMode: 'hardlink',
  folderPattern: '{Author}/{Title} ({Year})',
  fileNamePattern: '{Author} - {Title}',
  ebookFormats: 'epub,azw3,mobi,pdf',
  audiobookFormats: 'm4b,mp3,m4a,flac,ogg,opus',
  minSeeders: 1,
  metadataProvider: 'openlibrary',
  searchOnAdd: true,
  rssIntervalMinutes: 15,
  language: '',
};

export function formatList(csv: string): string[] {
  return csv.split(',').map((s) => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
}
