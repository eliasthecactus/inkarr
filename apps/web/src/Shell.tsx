import { useMemo, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import { BookPanelsContext, useApi, type NavItem } from '@inkarr/web-sdk';
import { collect } from './registry.ts';

function Sidebar({ nav, open, onNavigate }: { nav: NavItem[]; open: boolean; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const top = nav.filter((n) => !n.parent);
  const children = (id: string) => nav.filter((n) => n.parent === id);
  const isActive = (item: NavItem) => (item.path === '/' ? pathname === '/' || pathname.startsWith('/book/') : pathname.startsWith(item.path));

  return (
    <nav className={`sidebar${open ? ' open' : ''}`}>
      {top.map((item) => {
        const kids = children(item.id);
        const active = isActive(item) || kids.some(isActive);
        const Icon = item.icon;
        const Badge = item.badge;
        return (
          <div key={item.id} className={`nav-group${active ? ' active' : ''}`}>
            <NavLink to={kids[0] && !active ? kids[0].path : item.path} className="nav-item" onClick={onNavigate} end={item.path === '/'}>
              {Icon && <Icon size={18} />}
              <span>{item.label}</span>
              {Badge && <Badge />}
            </NavLink>
            {active &&
              kids.map((kid) => {
                const KidBadge = kid.badge;
                return (
                  <NavLink key={kid.id} to={kid.path} className="nav-subitem" onClick={onNavigate} end>
                    <span>{kid.label}</span>
                    {KidBadge && <KidBadge />}
                  </NavLink>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}

export function Shell() {
  const plugins = useApi<{ id: string; enabled: boolean }[]>('/system/plugins', { staleTime: Infinity });
  const enabled = useMemo(() => (plugins.data ? new Set(plugins.data.filter((p) => p.enabled).map((p) => p.id)) : undefined), [plugins.data]);
  const { routes, nav, bookPanels } = useMemo(() => collect(enabled), [enabled]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/');
  };

  return (
    <BookPanelsContext.Provider value={bookPanels}>
      <div className="app">
        <header className="header">
          <button className="icon-button header-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <NavLink to="/" className="logo">
            <img src="/logo.svg" alt="" width={30} height={30} />
            <span>Inkarr</span>
          </NavLink>
          <form className="header-search" onSubmit={onSearch}>
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search library" />
          </form>
        </header>
        <Sidebar nav={nav} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <main className="main">
          <Routes>
            {routes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            <Route path="*" element={<div className="page-content"><h2>Not found</h2></div>} />
          </Routes>
        </main>
      </div>
    </BookPanelsContext.Provider>
  );
}
