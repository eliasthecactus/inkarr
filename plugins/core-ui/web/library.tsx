import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownAZ, BookPlus, Grid3x3, Library, List, RefreshCw, Search } from 'lucide-react';
import { api, Badge, Cover, EmptyState, ErrorBox, MediaIcon, PageContent, PageToolbar, Spinner, ToolbarButton, ToolbarSeparator, useApi, useApiMutation, useToast } from '@inkarr/web-sdk';
import { statusClass, statusLabel, statusTone, type Book } from './types.ts';

type Filter = 'all' | 'ebook' | 'audiobook' | 'missing' | 'downloaded';
type Sort = 'title' | 'author' | 'added' | 'year';

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export function LibraryPage() {
  const books = useApi<Book[]>('/books', { refetchInterval: 15_000 });
  const [params] = useSearchParams();
  const q = params.get('q')?.toLowerCase() ?? '';
  const [view, setView] = useState<'posters' | 'table'>(readPref('inkarr.libraryView', 'posters'));
  const [filter, setFilter] = useState<Filter>(readPref('inkarr.libraryFilter', 'all'));
  const [sort, setSort] = useState<Sort>(readPref('inkarr.librarySort', 'title'));
  const navigate = useNavigate();
  const [toast, showToast] = useToast();
  const searchAll = useApiMutation(() => api.post('/system/tasks/search-wanted/run'), []);

  const list = useMemo(() => {
    let l = books.data ?? [];
    if (q) l = l.filter((b) => `${b.title} ${b.author} ${b.series ?? ''}`.toLowerCase().includes(q));
    if (filter === 'ebook' || filter === 'audiobook') l = l.filter((b) => b.mediaType === filter);
    if (filter === 'missing') l = l.filter((b) => b.status !== 'downloaded' && b.monitored);
    if (filter === 'downloaded') l = l.filter((b) => b.status === 'downloaded');
    const cmp: Record<Sort, (a: Book, b: Book) => number> = {
      title: (a, b) => a.title.localeCompare(b.title),
      author: (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title),
      added: (a, b) => b.addedAt - a.addedAt,
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    };
    return [...l].sort(cmp[sort]);
  }, [books.data, q, filter, sort]);

  const cycleSort = () => {
    const order: Sort[] = ['title', 'author', 'added', 'year'];
    const next = order[(order.indexOf(sort) + 1) % order.length]!;
    setSort(next);
    writePref('inkarr.librarySort', next);
  };
  const changeFilter = (f: Filter) => {
    setFilter(f);
    writePref('inkarr.libraryFilter', f);
  };
  const changeView = (v: 'posters' | 'table') => {
    setView(v);
    writePref('inkarr.libraryView', v);
  };

  return (
    <>
      <PageToolbar
        right={
          <>
            <select className="input" style={{ width: 150 }} value={filter} onChange={(e) => changeFilter(e.target.value as Filter)}>
              <option value="all">All</option>
              <option value="ebook">Ebooks</option>
              <option value="audiobook">Audiobooks</option>
              <option value="missing">Missing</option>
              <option value="downloaded">Downloaded</option>
            </select>
            <ToolbarSeparator />
            <ToolbarButton icon={ArrowDownAZ} label={`Sort: ${sort}`} onClick={cycleSort} />
            <ToolbarButton icon={Grid3x3} label="Posters" active={view === 'posters'} onClick={() => changeView('posters')} />
            <ToolbarButton icon={List} label="Table" active={view === 'table'} onClick={() => changeView('table')} />
          </>
        }
      >
        <ToolbarButton icon={RefreshCw} label="Refresh" spinning={books.isFetching} onClick={() => books.refetch()} />
        <ToolbarButton
          icon={Search}
          label="Search all"
          onClick={() => searchAll.mutate(undefined, { onSuccess: () => showToast('Searching all wanted books…', 'success') })}
        />
        <ToolbarSeparator />
        <ToolbarButton icon={BookPlus} label="Add new" onClick={() => navigate('/add')} />
      </PageToolbar>
      <PageContent wide>
        <ErrorBox error={books.error} />
        {books.isLoading ? (
          <Spinner />
        ) : !books.data?.length ? (
          <EmptyState icon={Library} title="Your library is empty">
            <Link to="/add">Add your first book</Link>, then set up an indexer and a download client under Settings.
          </EmptyState>
        ) : !list.length ? (
          <EmptyState title="Nothing matches this filter" />
        ) : view === 'posters' ? (
          <>
            <div className="poster-grid">
              {list.map((b) => (
                <Link key={b.id} to={`/book/${b.id}`} className="poster" title={`${b.title} — ${statusLabel(b)}`}>
                  <Cover src={b.coverUrl} title={b.title} author={b.author} />
                  <div className={`poster-status ${statusClass(b)}`} />
                  <span className="poster-media">
                    <MediaIcon type={b.mediaType} />
                  </span>
                  <div className="poster-info">
                    <div className="poster-title">{b.title}</div>
                    <div className="poster-author">{b.author}</div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="legend">
              <span><i className="status-downloaded" /> Downloaded</span>
              <span><i className="status-grabbed" /> Downloading</span>
              <span><i className="status-wanted" /> Missing (monitored)</span>
              <span><i className="status-unmonitored" /> Unmonitored</span>
              <span className="spacer" />
              <span>{list.length} books</span>
            </div>
          </>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Title</th>
                  <th>Author</th>
                  <th>Year</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td style={{ width: 8, padding: 0 }} className={statusClass(b)} />
                    <td className="title-cell">
                      <Link to={`/book/${b.id}`}>{b.title}</Link>
                    </td>
                    <td>{b.author}</td>
                    <td>{b.year ?? '—'}</td>
                    <td>
                      <Badge>
                        <MediaIcon type={b.mediaType} /> {b.mediaType}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone(b)}>{statusLabel(b)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>
      {toast}
    </>
  );
}
