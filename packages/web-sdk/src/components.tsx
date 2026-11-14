import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Headphones, Loader2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function PageToolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">{children}</div>
      <div className="toolbar-group">{right}</div>
    </div>
  );
}

export function ToolbarButton({ icon: Icon, label, onClick, active, spinning, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; active?: boolean; spinning?: boolean; disabled?: boolean }) {
  return (
    <button className={`toolbar-button${active ? ' active' : ''}`} onClick={onClick} disabled={disabled} title={label}>
      <Icon size={20} className={spinning ? 'spin' : undefined} />
      <span>{label}</span>
    </button>
  );
}

export function ToolbarSeparator() {
  return <div className="toolbar-separator" />;
}

export function PageContent({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`page-content${wide ? ' wide' : ''}`}>{children}</div>;
}

export function Section({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      {(title || actions) && (
        <div className="section-header">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div className="spinner">
      <Loader2 size={size} className="spin" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={48} strokeWidth={1.25} />}
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="alert alert-danger">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Badge({ children, tone = 'default', title }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function MediaIcon({ type, size = 14 }: { type: string; size?: number }) {
  return type === 'audiobook' ? <Headphones size={size} /> : <BookOpen size={size} />;
}

export function Button({ children, onClick, kind = 'default', type = 'button', disabled, icon: Icon, loading, title }: { children?: ReactNode; onClick?: () => void; kind?: 'default' | 'primary' | 'danger' | 'success' | 'ghost'; type?: 'button' | 'submit'; disabled?: boolean; icon?: LucideIcon; loading?: boolean; title?: string }) {
  return (
    <button type={type} className={`btn btn-${kind}`} onClick={onClick} disabled={disabled || loading} title={title}>
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children, footer, size = 'md' }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab${t.id === value ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = 'info' }: { value: number; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  return (
    <div className="progress">
      <div className={`progress-bar progress-${tone}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Cover({ src, title, author }: { src?: string | null; title: string; author?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="cover cover-placeholder">
        <span className="cover-title">{title}</span>
        {author && <span className="cover-author">{author}</span>}
      </div>
    );
  }
  return <img className="cover" src={src} alt={title} loading="lazy" onError={() => setFailed(true)} />;
}

/** Shows a short-lived message; return value is [node, show]. */
export function useToast(): [ReactNode, (msg: string, tone?: 'success' | 'danger' | 'info') => void] {
  const [toast, setToast] = useState<{ msg: string; tone: string; id: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? <div className={`toast toast-${toast.tone}`}>{toast.msg}</div> : null;
  return [node, (msg, tone = 'info') => setToast({ msg, tone, id: Date.now() })];
}
