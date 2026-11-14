/**
 * @inkarr/web-sdk — what UI plugins build on.
 *
 * A web plugin is a folder `plugins/<id>/web/index.tsx` that default-exports
 * `defineWebPlugin({...})`. It can add routes (pages), sidebar entries
 * (top-level or under an existing section like "settings"), and panels on
 * the book detail page. The core pages themselves are a plugin (core-ui).
 */
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  /** Unique id, children reference it via `parent`. */
  id: string;
  label: string;
  path: string;
  icon?: LucideIcon;
  /** Id of the parent nav item, e.g. "settings" or "system". */
  parent?: string;
  /** Lower = higher in the list. Core uses multiples of 10. */
  order?: number;
  /** Live badge, e.g. queue size. */
  badge?: ComponentType;
}

export interface RouteDef {
  path: string;
  element: ReactNode;
}

export interface BookPanel {
  id: string;
  title: string;
  order?: number;
  component: ComponentType<{ book: any }>;
}

export interface WebPlugin {
  id: string;
  name?: string;
  routes?: RouteDef[];
  nav?: NavItem[];
  bookPanels?: BookPanel[];
}

export function defineWebPlugin(p: WebPlugin): WebPlugin {
  return p;
}

/** Provided by the app shell: panels contributed by all enabled plugins. */
export const BookPanelsContext = createContext<BookPanel[]>([]);
export const useBookPanels = () => useContext(BookPanelsContext);

export * from './api.ts';
export * from './components.tsx';
export * from './provider-settings.tsx';
export * from './format.ts';
