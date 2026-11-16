import React from 'react';
import { Briefcase, CheckSquare, Compass, FileUser } from 'lucide-react';
import { AppRoute, RouteName } from '../types/domain';
import { isRouteActive } from '../managers/routeManager';

interface TopBarProps {
  readonly route: AppRoute;
  readonly readyCount: number;
  readonly sentCount: number;
  readonly onNavigate: (route: AppRoute) => void;
}

const NAV_ITEMS: ReadonlyArray<{
  readonly name: RouteName;
  readonly label: string;
  readonly mobileLabel: string;
  readonly route: AppRoute;
  readonly icon: React.FC<{ className?: string }>;
}> = [
  {
    name: 'discover',
    label: 'Discover',
    mobileLabel: 'Discover',
    route: { name: 'discover', path: '/' },
    icon: Compass,
  },
  {
    name: 'queue',
    label: 'Review Queue',
    mobileLabel: 'Queue',
    route: { name: 'queue', path: '/queue' },
    icon: CheckSquare,
  },
  {
    name: 'applications',
    label: 'Applications',
    mobileLabel: 'Applied',
    route: { name: 'applications', path: '/applications' },
    icon: Briefcase,
  },
  {
    name: 'profile',
    label: 'CV Profile',
    mobileLabel: 'CV',
    route: { name: 'profile', path: '/cv' },
    icon: FileUser,
  },
];

export const TopBar: React.FC<TopBarProps> = ({
  route,
  readyCount,
  sentCount,
  onNavigate,
}) => {
  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate({ name: 'discover', path: '/' });
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 rounded"
          >
            StagePilot
          </a>

          {/* Zone 2: 4 concise single-line text nav links (Desktop) */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            {NAV_ITEMS.map((item) => {
              const active = isRouteActive(route, item.name);
              const countSuffix =
                item.name === 'queue' && readyCount > 0
                  ? ` (${readyCount})`
                  : item.name === 'applications' && sentCount > 0
                    ? ` (${sentCount})`
                    : '';

              return (
                <a
                  key={item.name}
                  href={`#${item.route.path}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(item.route);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 tabular-nums ${
                    active
                      ? 'text-slate-900 border-blue-700 font-semibold'
                      : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                  {countSuffix}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onNavigate({ name: 'queue', path: '/queue' })}
              className="px-3.5 py-2 md:px-4 md:py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Ready to Send ({readyCount})
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Navigation (< 15% combined viewport height) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          {NAV_ITEMS.map((item) => {
            const active = isRouteActive(route, item.name);
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => onNavigate(item.route)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[44px] w-full text-[11px] font-medium transition-colors ${
                  active ? 'text-blue-700 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="whitespace-nowrap">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
