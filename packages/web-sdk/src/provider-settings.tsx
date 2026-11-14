import { useState } from 'react';
import { CheckCircle2, ExternalLink, Plus, XCircle } from 'lucide-react';
import type { Field } from '@inkarr/sdk';
import { api, useApi, useApiMutation } from './api.ts';
import { Badge, Button, EmptyState, ErrorBox, Modal, Spinner } from './components.tsx';

export type ProviderKind = 'indexer' | 'downloadClient' | 'connection';

interface Schema {
  type: string;
  name: string;
  description?: string;
  docsUrl?: string;
  pluginId: string;
  fields: Field[];
}

interface ProviderRow {
  id: number;
  type: string;
  name: string;
  enabled: boolean;
  priority: number;
  available: boolean;
  settings: Record<string, unknown>;
}

function defaults(fields: Field[]) {
  return Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));
}

export function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const id = `field-${field.key}`;
  let input;
  switch (field.type) {
    case 'boolean':
      input = (
        <label className="switch">
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span className="switch-slider" />
        </label>
      );
      break;
    case 'select':
      input = (
        <select id={id} className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
      input = <input id={id} className="input" type="number" value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
      break;
    default:
      input = (
        <input
          id={id}
          className="input"
          type={field.type === 'password' ? 'password' : 'text'}
          autoComplete={field.type === 'password' ? 'new-password' : 'off'}
          placeholder={field.placeholder}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <div className="form-row">
      <label className="form-label" htmlFor={id}>
        {field.label}
        {field.required && <span className="required">*</span>}
      </label>
      <div className="form-control">
        {input}
        {field.help && <div className="form-help">{field.help}</div>}
      </div>
    </div>
  );
}

export function SettingsForm({ fields, values, onChange, showAdvanced }: { fields: Field[]; values: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; showAdvanced?: boolean }) {
  return (
    <>
      {fields
        .filter((f) => showAdvanced || !f.advanced)
        .map((f) => (
          <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => onChange({ ...values, [f.key]: v })} />
        ))}
    </>
  );
}

function ProviderModal({ kind, schema, existing, onClose }: { kind: ProviderKind; schema: Schema; existing?: ProviderRow; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? schema.name);
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [priority, setPriority] = useState(existing?.priority ?? 25);
  const [settings, setSettings] = useState<Record<string, unknown>>(existing?.settings ?? defaults(schema.fields));
  const [advanced, setAdvanced] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const body = { id: existing?.id, type: schema.type, name, enabled, priority, settings };

  const save = useApiMutation(() => (existing ? api.put(`/providers/${kind}/${existing.id}`, body) : api.post(`/providers/${kind}`, body)), [`/providers/${kind}`]);
  const remove = useApiMutation(() => api.del(`/providers/${kind}/${existing!.id}`), [`/providers/${kind}`]);
  const missing = schema.fields.filter((f) => f.required && (settings[f.key] == null || settings[f.key] === ''));

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.post(`/providers/${kind}/test`, body));
    } catch (err) {
      setTest({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const hasAdvanced = schema.fields.some((f) => f.advanced);
  return (
    <Modal
      size="lg"
      title={`${existing ? 'Edit' : 'Add'} ${schema.name}`}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <Button kind="danger" loading={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: onClose })}>
              Delete
            </Button>
          )}
          <div className="spacer" />
          {hasAdvanced && (
            <Button kind="ghost" onClick={() => setAdvanced(!advanced)}>
              {advanced ? 'Hide advanced' : 'Show advanced'}
            </Button>
          )}
          <Button onClick={runTest} loading={testing}>
            Test
          </Button>
          <Button kind="primary" disabled={!name || missing.length > 0} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>
            Save
          </Button>
        </>
      }
    >
      {schema.description && (
        <div className="alert alert-info">
          {schema.description}
          {schema.docsUrl && (
            <a href={schema.docsUrl} target="_blank" rel="noreferrer" className="alert-link">
              Docs <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
      {test && <div className={`alert ${test.ok ? 'alert-success' : 'alert-danger'}`}>{test.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {test.message ?? (test.ok ? 'Test passed' : 'Test failed')}</div>}
      <ErrorBox error={save.error ?? remove.error} />
      <FieldInput field={{ key: 'name', label: 'Name', type: 'text', required: true }} value={name} onChange={(v) => setName(String(v))} />
      <FieldInput field={{ key: 'enabled', label: 'Enable', type: 'boolean' }} value={enabled} onChange={(v) => setEnabled(!!v)} />
      <SettingsForm fields={schema.fields} values={settings} onChange={setSettings} showAdvanced={advanced} />
      {advanced && <FieldInput field={{ key: 'priority', label: 'Priority', type: 'number', help: '1 (highest) – 50. Used to pick a download client and break ties between indexers.' }} value={priority} onChange={(v) => setPriority(Number(v ?? 25))} />}
    </Modal>
  );
}

/** Radarr-style grid of configured providers with an "add" card. */
export function ProviderSettingsPage({ kind, title, intro }: { kind: ProviderKind; title: string; intro?: string }) {
  const rows = useApi<ProviderRow[]>(`/providers/${kind}`);
  const schemas = useApi<Schema[]>(`/schema/${kind}`);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ schema: Schema; row?: ProviderRow } | null>(null);

  if (rows.isLoading || schemas.isLoading) return <Spinner />;
  const schemaOf = (type: string) => schemas.data?.find((s) => s.type === type);

  return (
    <div className="section">
      <div className="section-header">
        <h2>{title}</h2>
      </div>
      {intro && <p className="muted">{intro}</p>}
      <ErrorBox error={rows.error ?? schemas.error} />
      <div className="card-grid">
        {rows.data?.map((row) => {
          const schema = schemaOf(row.type);
          return (
            <button key={row.id} className="provider-card" onClick={() => schema && setEditing({ schema, row })} disabled={!schema}>
              <div className="provider-card-name">{row.name}</div>
              <div className="provider-card-tags">
                {row.enabled ? <Badge tone="success">Enabled</Badge> : <Badge>Disabled</Badge>}
                <Badge tone="info">{schema?.name ?? row.type}</Badge>
                {!row.available && <Badge tone="danger">Plugin missing</Badge>}
                {kind === 'indexer' && row.settings._rss !== false && <Badge>RSS</Badge>}
                {kind === 'connection' && row.settings._onGrab === true && <Badge>On grab</Badge>}
                {kind === 'connection' && row.settings._onImport !== false && <Badge>On import</Badge>}
              </div>
            </button>
          );
        })}
        <button className="provider-card provider-card-add" onClick={() => setPicking(true)}>
          <Plus size={28} />
        </button>
      </div>
      {rows.data?.length === 0 && <p className="muted">Nothing configured yet. Click + to add one.</p>}

      {picking && (
        <Modal title={`Add ${title.replace(/s$/, '')}`} onClose={() => setPicking(false)} size="lg">
          {schemas.data?.length === 0 ? (
            <EmptyState title="No plugins provide this yet">Drop a plugin into the plugins folder and restart Inkarr.</EmptyState>
          ) : (
            <div className="card-grid">
              {schemas.data?.map((s) => (
                <button
                  key={s.type}
                  className="provider-card provider-pick"
                  onClick={() => {
                    setPicking(false);
                    setEditing({ schema: s });
                  }}
                >
                  <div className="provider-card-name">{s.name}</div>
                  {s.description && <div className="provider-card-desc">{s.description}</div>}
                  <div className="provider-card-tags">
                    <Badge>plugin: {s.pluginId}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
      {editing && <ProviderModal kind={kind} schema={editing.schema} existing={editing.row} onClose={() => setEditing(null)} />}
    </div>
  );
}
