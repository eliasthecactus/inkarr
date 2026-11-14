import type { BookPanel, NavItem, RouteDef, WebPlugin } from '@inkarr/web-sdk';

// Every plugins/<id>/web/index.tsx is bundled at build time. Adding a UI
// plugin = dropping a folder in plugins/ and rebuilding the image.
const modules = import.meta.glob<{ default: WebPlugin }>('../../../plugins/*/web/index.tsx', { eager: true });

export const webPlugins: WebPlugin[] = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean);

export function collect(enabledIds?: Set<string>) {
  const active = webPlugins.filter((p) => !enabledIds || enabledIds.has(p.id) || p.id === 'core-ui');
  const routes: RouteDef[] = active.flatMap((p) => p.routes ?? []);
  const nav: NavItem[] = active.flatMap((p) => p.nav ?? []).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const bookPanels: BookPanel[] = active.flatMap((p) => p.bookPanels ?? []).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return { routes, nav, bookPanels };
}
