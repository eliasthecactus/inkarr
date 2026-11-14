export interface Book {
  id: number;
  foreignId: string;
  metadataSource: string;
  title: string;
  author: string;
  year: number | null;
  coverUrl: string | null;
  description: string | null;
  isbn: string[] | null;
  language: string | null;
  series: string | null;
  seriesIndex: number | null;
  mediaType: 'ebook' | 'audiobook';
  monitored: boolean;
  status: 'wanted' | 'grabbed' | 'downloaded';
  path: string | null;
  files: string[] | null;
  addedAt: number;
  sourceName?: string;
  sourceUrl?: string | null;
}

export interface QueueItem {
  id: number;
  bookId: number;
  releaseTitle: string;
  protocol: 'torrent' | 'ddl';
  status: string;
  progress: number;
  size: number | null;
  eta: number | null;
  message: string | null;
  outputPath: string | null;
  addedAt: number;
  clientName?: string;
  book: Book | null;
}

export interface HistoryItem {
  id: number;
  bookId: number | null;
  event: string;
  title: string;
  data: Record<string, unknown> | null;
  date: number;
  book?: Book | null;
}

export interface ScoredRelease {
  guid: string;
  title: string;
  protocol: 'torrent' | 'ddl';
  downloadUrl: string;
  infoUrl?: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  publishDate?: string;
  indexerId?: number;
  indexerName?: string;
  score: number;
  rejections: string[];
  detectedFormat?: string;
  detectedMediaType?: string;
  language?: string;
}

export function statusClass(b: Book) {
  if (!b.monitored && b.status !== 'downloaded') return 'status-unmonitored';
  return `status-${b.status}`;
}

export function statusLabel(b: Book) {
  if (b.status === 'downloaded') return 'Downloaded';
  if (b.status === 'grabbed') return 'Downloading';
  return b.monitored ? 'Missing' : 'Unmonitored';
}

export function statusTone(b: Book): 'success' | 'info' | 'danger' | 'default' {
  if (b.status === 'downloaded') return 'success';
  if (b.status === 'grabbed') return 'info';
  return b.monitored ? 'danger' : 'default';
}
