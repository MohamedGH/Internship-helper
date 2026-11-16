import { useCallback, useEffect, useState } from 'react';
import { AppRoute, RouteName } from '../types/domain';

export const parseHashToRoute = (rawHash: string): AppRoute => {
  const cleaned = rawHash.replace(/^#/, '').trim();
  const normalized = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  const cleanPath = normalized.split('?')[0].replace(/\/+$/, '') || '/';

  if (cleanPath === '/' || cleanPath === '/discover') {
    return { name: 'discover', path: '/' };
  }

  if (cleanPath === '/queue') {
    return { name: 'queue', path: '/queue' };
  }

  if (cleanPath === '/applications') {
    return { name: 'applications', path: '/applications' };
  }

  if (cleanPath === '/cv' || cleanPath === '/profile') {
    return { name: 'profile', path: '/cv' };
  }

  if (cleanPath.startsWith('/dossier/')) {
    const rawId = cleanPath.slice('/dossier/'.length);
    const offerId = decodeURIComponent(rawId).trim();
    if (offerId.length > 0) {
      return {
        name: 'dossier',
        path: `/dossier/${encodeURIComponent(offerId)}`,
        offerId,
      };
    }
  }

  return { name: 'discover', path: '/' };
};

export const routeToHash = (route: AppRoute): string => `#${route.path}`;

export const buildDossierRoute = (offerId: string): AppRoute => ({
  name: 'dossier',
  path: `/dossier/${encodeURIComponent(offerId)}`,
  offerId,
});

export const isRouteActive = (current: AppRoute, target: RouteName): boolean => {
  if (target === 'discover' && current.name === 'dossier') {
    return false;
  }
  return current.name === target;
};

export const getRouteTitle = (route: AppRoute): string => {
  switch (route.name) {
    case 'discover':
      return 'Discover Stages & Internships';
    case 'dossier':
      return 'Application Studio & Check';
    case 'queue':
      return 'Ready-to-Send Queue';
    case 'applications':
      return 'Sent Applications Tracker';
    case 'profile':
      return 'Candidate CV & Profile';
  }
};

export const useRouteManager = () => {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === 'undefined') {
      return { name: 'discover', path: '/' };
    }
    return parseHashToRoute(window.location.hash);
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleHashChange = () => {
      setRoute(parseHashToRoute(window.location.hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    if (typeof window !== 'undefined') {
      const targetHash = routeToHash(nextRoute);
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setRoute(nextRoute);
  }, []);

  const openDossier = useCallback(
    (offerId: string) => {
      navigate(buildDossierRoute(offerId));
    },
    [navigate]
  );

  return {
    route,
    navigate,
    openDossier,
  };
};
