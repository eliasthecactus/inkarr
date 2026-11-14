import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { Field } from '@inkarr/sdk';
import { api, ErrorBox, PageContent, PageToolbar, ProviderSettingsPage, Section, SettingsForm, Spinner, ToolbarButton, useApi, useApiMutation, useToast } from '@inkarr/web-sdk';

type Settings = Record<string, unknown>;

/** A core settings page: a list of fields bound to /api/settings. */
function CoreSettingsPage({ sections }: { sections: { title: string; fields: Field[] | ((meta: any) => Field[]) }[] }) {
  const query = useApi<{ settings: Settings; metadataProviders: { id: string; name: string }[] }>('/settings');
  const [values, setValues] = useState<Settings>({});
  const [advanced] = useState(true);
  const [toast, showToast] = useToast();
  const save = useApiMutation((v: Settings) => api.put('/settings', v), ['/settings']);
  useEffect(() => {
    if (query.data) setValues(query.data.settings);
  }, [query.data]);
  const dirty = query.data && JSON.stringify(values) !== JSON.stringify(query.data.settings);

  return (
    <>
      <PageToolbar>
        <ToolbarButton icon={Save} label={dirty ? 'Save changes' : 'No changes'} disabled={!dirty || save.isPending} onClick={() => save.mutate(values, { onSuccess: () => showToast('Settings saved', 'success') })} />
      </PageToolbar>
      <PageContent>
        <ErrorBox error={query.error ?? save.error} />
        {query.isLoading ? (
          <Spinner />
        ) : (
          sections.map((s) => (
            <Section key={s.title} title={s.title}>
              <SettingsForm fields={typeof s.fields === 'function' ? s.fields(query.data) : s.fields} values={values} onChange={setValues} showAdvanced={advanced} />
            </Section>
          ))
        )}
      </PageContent>
      {toast}
    </>
  );
}

export function MediaManagementPage() {
  return (
    <CoreSettingsPage
      sections={[
        {
          title: 'Root folders',
          fields: [
            { key: 'ebookRoot', label: 'Ebook library', type: 'path', required: true, help: 'Imported ebooks go here.' },
            { key: 'audiobookRoot', label: 'Audiobook library', type: 'path', required: true, help: 'Point Audiobookshelf at this folder.' },
          ],
        },
        {
          title: 'Importing',
          fields: [
            {
              key: 'importMode',
              label: 'Import mode',
              type: 'select',
              options: [
                { value: 'hardlink', label: 'Hardlink (falls back to copy)' },
                { value: 'copy', label: 'Copy' },
                { value: 'move', label: 'Move (DDL only — torrents keep seeding)' },
              ],
              help: 'Hardlinks take no extra space but need source and library on the same filesystem.',
            },
            { key: 'folderPattern', label: 'Folder format', type: 'text', help: 'Tokens: {Author} {Title} {FullTitle} {Year} {Series} {SeriesIndex}. Use / for sub-folders.' },
            { key: 'fileNamePattern', label: 'File name format', type: 'text', help: 'Same tokens. Extension is added automatically.' },
          ],
        },
      ]}
    />
  );
}

export function QualityPage() {
  return (
    <CoreSettingsPage
      sections={[
        {
          title: 'Formats',
          fields: [
            { key: 'ebookFormats', label: 'Ebook formats', type: 'text', help: 'Allowed formats, most preferred first. Releases in other formats are rejected.' },
            { key: 'audiobookFormats', label: 'Audiobook formats', type: 'text', help: 'Most preferred first.' },
          ],
        },
        {
          title: 'Release rules',
          fields: [
            { key: 'minSeeders', label: 'Minimum seeders', type: 'number', help: 'Torrents with fewer seeders are rejected for automatic grabs.' },
            { key: 'language', label: 'Language', type: 'text', placeholder: 'en', help: 'Reject releases that declare another language. Empty = any.' },
          ],
        },
      ]}
    />
  );
}

interface MetaProvider { id: string; name: string; description?: string; fields: Field[]; settings: Settings }

function MetadataSourceCard({ p }: { p: MetaProvider }) {
  const [values, setValues] = useState<Settings>(p.settings);
  const [toast, showToast] = useToast();
  const save = useApiMutation(() => api.put(`/metadata/providers/${p.id}`, { settings: values }), ['/settings', '/metadata']);
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ marginBottom: 4 }}>{p.name}</h3>
      {p.description && <p className="muted" style={{ marginTop: 0 }}>{p.description}</p>}
      {p.fields.length > 0 && (
        <>
          <SettingsForm fields={p.fields} values={values} onChange={setValues} showAdvanced />
          <div className="form-row">
            <span />
            <div>
              <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => showToast(`${p.name} saved`, 'success') })}>
                Save {p.name}
              </button>
            </div>
          </div>
        </>
      )}
      <ErrorBox error={save.error} />
      {toast}
    </div>
  );
}

function MetadataSources() {
  const q = useApi<MetaProvider[]>('/metadata/providers');
  if (!q.data?.length) return null;
  return (
    <PageContent>
      <Section title="Metadata sources">
        {q.data.map((p) => (
          <MetadataSourceCard key={p.id} p={p} />
        ))}
      </Section>
    </PageContent>
  );
}

export function GeneralSettingsPage() {
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem('inkarr.apiKey') ?? '';
    } catch {
      return '';
    }
  });
  return (
    <>
      <CoreSettingsPage
        sections={[
          {
            title: 'Searching',
            fields: (meta: { metadataProviders: { id: string; name: string }[] }) => [
              { key: 'metadataProvider', label: 'Default metadata source', type: 'select', options: meta.metadataProviders.map((m) => ({ value: m.id, label: m.name })), help: 'Preselected on the Add page; you can switch per search.' },
              { key: 'searchOnAdd', label: 'Search when adding', type: 'boolean', help: 'Default for the “Search now” toggle when adding a book.' },
              { key: 'rssIntervalMinutes', label: 'RSS sync interval', type: 'number', help: 'Minutes. Indexers with RSS enabled are checked for wanted books.' },
            ],
          },
        ]}
      />
      <MetadataSources />
      <PageContent>
        <Section title="This browser">
          <div className="form-row">
            <label className="form-label">API key</label>
            <div className="form-control">
              <input
                className="input"
                type="password"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  try {
                    localStorage.setItem('inkarr.apiKey', e.target.value);
                  } catch {
                    /* ignore */
                  }
                }}
              />
              <div className="form-help">Only needed when the server runs with INKARR_API_KEY. Stored in this browser.</div>
            </div>
          </div>
        </Section>
      </PageContent>
    </>
  );
}

export const IndexersPage = () => (
  <PageContent>
    <ProviderSettingsPage
      kind="indexer"
      title="Indexers"
      intro="Where Inkarr looks for releases. Torrent indexers usually come from Prowlarr via Torznab; DDL sources need a DDL download client."
    />
  </PageContent>
);

export const DownloadClientsPage = () => (
  <PageContent>
    <ProviderSettingsPage
      kind="downloadClient"
      title="Download clients"
      intro="Each release goes to the highest-priority enabled client that supports its protocol (torrent or DDL)."
    />
  </PageContent>
);

export const ConnectionsPage = () => (
  <PageContent>
    <ProviderSettingsPage kind="connection" title="Connections" intro="Tell other apps about new books: add them to Calibre, rescan Audiobookshelf, call a webhook…" />
  </PageContent>
);
