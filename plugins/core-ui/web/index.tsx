import { Navigate } from 'react-router-dom';
import { Activity, BookMarked, BookPlus, Library, Monitor, Settings } from 'lucide-react';
import { defineWebPlugin } from '@inkarr/web-sdk';
import { LibraryPage } from './library.tsx';
import { AddBookPage } from './add.tsx';
import { BookPage } from './book.tsx';
import { HistoryPage, QueueBadge, QueuePage, WantedPage } from './activity.tsx';
import { ConnectionsPage, DownloadClientsPage, GeneralSettingsPage, IndexersPage, MediaManagementPage, QualityPage } from './settings.tsx';
import { LogsPage, PluginsPage, StatusPage, TasksPage } from './system.tsx';

/**
 * The core pages are a plugin like any other. A third-party plugin adds a
 * page the same way: a route plus a nav item (optionally under "settings"
 * or "system").
 */
export default defineWebPlugin({
  id: 'core-ui',
  name: 'Core pages',
  routes: [
    { path: '/', element: <LibraryPage /> },
    { path: '/add', element: <AddBookPage /> },
    { path: '/book/:id', element: <BookPage /> },
    { path: '/wanted', element: <WantedPage /> },
    { path: '/activity', element: <Navigate to="/activity/queue" replace /> },
    { path: '/activity/queue', element: <QueuePage /> },
    { path: '/activity/history', element: <HistoryPage /> },
    { path: '/settings', element: <Navigate to="/settings/mediamanagement" replace /> },
    { path: '/settings/mediamanagement', element: <MediaManagementPage /> },
    { path: '/settings/quality', element: <QualityPage /> },
    { path: '/settings/indexers', element: <IndexersPage /> },
    { path: '/settings/downloadclients', element: <DownloadClientsPage /> },
    { path: '/settings/connect', element: <ConnectionsPage /> },
    { path: '/settings/general', element: <GeneralSettingsPage /> },
    { path: '/system', element: <Navigate to="/system/status" replace /> },
    { path: '/system/status', element: <StatusPage /> },
    { path: '/system/tasks', element: <TasksPage /> },
    { path: '/system/plugins', element: <PluginsPage /> },
    { path: '/system/logs', element: <LogsPage /> },
  ],
  nav: [
    { id: 'library', label: 'Library', path: '/', icon: Library, order: 10 },
    { id: 'add', label: 'Add new', path: '/add', icon: BookPlus, order: 20 },
    { id: 'activity', label: 'Activity', path: '/activity', icon: Activity, order: 30, badge: QueueBadge },
    { id: 'activity-queue', parent: 'activity', label: 'Queue', path: '/activity/queue', order: 10 },
    { id: 'activity-history', parent: 'activity', label: 'History', path: '/activity/history', order: 20 },
    { id: 'wanted', label: 'Wanted', path: '/wanted', icon: BookMarked, order: 40 },
    { id: 'settings', label: 'Settings', path: '/settings', icon: Settings, order: 80 },
    { id: 'settings-media', parent: 'settings', label: 'Media Management', path: '/settings/mediamanagement', order: 10 },
    { id: 'settings-quality', parent: 'settings', label: 'Formats & Rules', path: '/settings/quality', order: 20 },
    { id: 'settings-indexers', parent: 'settings', label: 'Indexers', path: '/settings/indexers', order: 30 },
    { id: 'settings-clients', parent: 'settings', label: 'Download Clients', path: '/settings/downloadclients', order: 40 },
    { id: 'settings-connect', parent: 'settings', label: 'Connect', path: '/settings/connect', order: 50 },
    { id: 'settings-general', parent: 'settings', label: 'General', path: '/settings/general', order: 60 },
    { id: 'system', label: 'System', path: '/system', icon: Monitor, order: 90 },
    { id: 'system-status', parent: 'system', label: 'Status', path: '/system/status', order: 10 },
    { id: 'system-tasks', parent: 'system', label: 'Tasks', path: '/system/tasks', order: 20 },
    { id: 'system-plugins', parent: 'system', label: 'Plugins', path: '/system/plugins', order: 30 },
    { id: 'system-logs', parent: 'system', label: 'Logs', path: '/system/logs', order: 40 },
  ],
});
