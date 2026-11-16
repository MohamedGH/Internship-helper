/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X } from 'lucide-react';
import { AppError } from './types/domain';
import { AppStateProvider, useAppState } from './managers/AppStateContext';
import { useRouteManager } from './managers/routeManager';
import { selectPipelineCounts } from './managers/stateManager';
import { TopBar } from './components/TopBar';
import { ErrorBanner } from './components/ErrorBanner';
import { DiscoverView } from './components/DiscoverView';
import { DossierStudioView } from './components/DossierStudioView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { ApplicationsView } from './components/ApplicationsView';
import { CvProfileView } from './components/CvProfileView';

const StagePilotShell: React.FC = () => {
  const { state, dispatch, runMultiSourceSearch } = useAppState();
  const { route, navigate, openDossier } = useRouteManager();
  const counts = selectPipelineCounts(state);

  const handleRetryError = (error: AppError) => {
    dispatch({ type: 'DISMISS_ERROR', id: error.id });
    if (error.context === 'search') {
      void runMultiSourceSearch();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopBar
        route={route}
        readyCount={counts.ready}
        sentCount={counts.sent}
        onNavigate={navigate}
      />

      <ErrorBanner
        errors={state.errors}
        onDismiss={(id) => dispatch({ type: 'DISMISS_ERROR', id })}
        onRetry={handleRetryError}
      />

      {state.lastDispatchNotice && (
        <div
          role="status"
          className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900">
            <span className="font-medium">{state.lastDispatchNotice}</span>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR_NOTICE' })}
              aria-label="Dismiss dispatch confirmation"
              className="p-1 text-emerald-700 hover:text-emerald-950 rounded"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1">
        {route.name === 'discover' && (
          <DiscoverView
            onOpenDossier={openDossier}
            onGoToProfile={() => navigate({ name: 'profile', path: '/cv' })}
          />
        )}

        {route.name === 'dossier' && (
          <DossierStudioView
            offerId={route.offerId}
            onBack={() => navigate({ name: 'discover', path: '/' })}
            onGoToQueue={() => navigate({ name: 'queue', path: '/queue' })}
          />
        )}

        {route.name === 'queue' && (
          <ReviewQueueView
            onOpenDossier={openDossier}
            onGoToDiscover={() => navigate({ name: 'discover', path: '/' })}
          />
        )}

        {route.name === 'applications' && (
          <ApplicationsView
            onOpenDossier={openDossier}
            onGoToDiscover={() => navigate({ name: 'discover', path: '/' })}
          />
        )}

        {route.name === 'profile' && <CvProfileView />}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppStateProvider>
      <StagePilotShell />
    </AppStateProvider>
  );
}
