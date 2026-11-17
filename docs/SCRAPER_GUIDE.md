# StagePilot — Architecture de Recherche, Connecteurs ATS & Jobboards Généralistes

StagePilot collecte et découvre des offres de stage sans aucun LLM ni clé d'API payante, à l'aide du moteur modulaire situé dans `server/search/`.

---

## 1. Architecture Modulaire (`server/search/`)

### Couche d'orchestration & ATS (`server/search/`)
- `scraperEngine.ts` : Orchestre la collecte concurrente bornée, la normalisation, la déduplication multi-sources, le filtrage déterministe, le scoring 0–100 et la journalisation (`collectedCount`, `discoveredCount`, `jobBoardPolicies`).
- `scraperRegistry.ts` : Unifie les connecteurs ATS publics, les sources personnalisées (`CustomSource`) et la couche jobboards généralistes.
- **Connecteurs ATS JSON publics** :
  - `connectors/greenhouseScraper.ts` (`boards-api.greenhouse.io`)
  - `connectors/leverScraper.ts` (`api.lever.co`)
  - `connectors/ashbyScraper.ts` (`api.ashbyhq.com`)
- **Connecteur HTML autorisé** :
  - `connectors/genericHtmlScraper.ts` : Cheerio + JSON-LD `JobPosting`, contrôle SSRF (`urlGuard.ts`) et `robots.txt` (`robotsGuard.ts`), respect du TTL de cache.

### Couche Jobboards Généralistes & Découverte Web (`server/search/jobboards/`)
- `jobBoardPolicy.ts` : Définit les modes d'accès (`official_api`, `rss_feed`, `authorized_html`, `search_index`, `link_only`, `disabled`), le statut d'autorisation, la liste des champs collectables et la fonction `sanitizeOfferByPolicy`.
- `jobBoardRegistry.ts` : Registre auditable avec URL du site, URL des CGU, URL `robots.txt`, date de dernière vérification, besoin d'accord écrit ou d'identifiants API.
- `searchDiscoveryProvider.ts` : Interface interchangeable de découverte Web via API autorisée (`SearXNG JSON API`, `Brave Search API`, ou passerelle JSON configurable). **Aucun scraping HTML de Google ou Bing n'est effectué.**
- `jobBoardProvider.ts` : Implémente les fournisseurs spécialisés (`France Travail API v2`, `Remotive API`, `Flux RSS/Atom`, et `link_only + search_index`).
- `jobBoardSearch.ts` : Adapte la couche jobboards en connecteurs pour `scraperEngine.ts` et expose `getJobBoardPolicySnapshots` (`GET /api/sources/registry`).

---

## 2. Politique d'Accès par Source

| Source | Mode d'accès par défaut | Politique & Contraintes |
| :--- | :--- | :--- |
| **Company Career Page (Greenhouse / Lever / Ashby)** | `ats_api` (Actif) | API JSON publiques sans authentification. Offres marquées `verified`. |
| **France Travail** | `official_api` (si identifiants) / `link_only` | Utilise OAuth2 `client_credentials` sur l'API officielle *Offres d'emploi v2*. Gère la pagination, les quotas (`429`) et la suspension (`503`). **Ne bascule jamais vers du scraping HTML.** |
| **Remotive** | `official_api` (Actif) | API JSON officielle publique `remotive.com/api/remote-jobs` avec lien de retour vers Remotive. |
| **We Work Remotely** | `rss_feed` (Actif) | Flux RSS officiels validés au préalable contre `robots.txt`. |
| **Meteojob** | `link_only` (+ `search_index` optionnel) | CGU interdisant l'extraction automatisée sans accord écrit. Aucun scraper HTML ni API interne. Activation API future uniquement si `METEOJOB_WRITTEN_AUTH=true` et `METEOJOB_API_TOKEN` sont fournis. |
| **HelloWork** | `link_only` (+ `search_index` optionnel) | Protégé par WAF et CGU restrictives. Liens de recherche et découverte externe non vérifiée uniquement. |
| **Welcome to the Jungle (WTTJ)** | `link_only` (+ `search_index` optionnel) | Absence d'API publique ouverte ; CGU restrictives. Liens et découverte externe non vérifiée uniquement. |
| **Apec** | `link_only` (+ `search_index` optionnel) | Partenariat / accord requis par les CGU. Liens et découverte externe non vérifiée uniquement. |
| **LinkedIn / Indeed / JobTeaser** | `link_only` | Protégés par CGU / anti-bot / authentification. Liens de recherche officiels uniquement. |

---

## 3. Statuts de Vérification & Règles de Candidature

StagePilot distingue strictement les résultats légalement collectés des liens découverts via un index de recherche externe :
- `collected` + `verified` (ou `collected`) : Offre extraite d'une API ATS/officielle, d'un flux RSS ou d'une page carrière autorisée. Les dates/durées absentes restent `null` (jamais inventées). Peut être préparée pour l'envoi en 1 clic si un canal vérifié existe.
- `discovered` + `externally_unverified` : Lien découvert via `search_index` (ex. Meteojob, HelloWork, Apec, WTTJ). **L'application bloque automatiquement le statut "Prête à candidater / Ready to send"** et invite le candidat à ouvrir directement l'annonce sur le site source pour vérifier son contenu et postuler.
- `expired` : Offre expirée automatiquement écartée par le filtre strict.

---

## 4. Variables d'Environnement (Optionnelles)

Toutes les variables sont documentées dans `.env.example` :

```bash
# API officielle France Travail (Offres d'emploi v2)
FRANCE_TRAVAIL_CLIENT_ID=
FRANCE_TRAVAIL_CLIENT_SECRET=
FRANCE_TRAVAIL_API_ENABLED=true
FRANCE_TRAVAIL_API_SUSPENDED=false

# Fournisseur de découverte Web autorisé (optionnel, un seul suffit)
SEARXNG_BASE_URL=
BRAVE_SEARCH_API_KEY=
WEB_SEARCH_API_URL=
WEB_SEARCH_API_KEY=

# Activation future Meteojob uniquement avec accord écrit officiel
METEOJOB_WRITTEN_AUTH=false
METEOJOB_API_TOKEN=
```

---

## 5. Limites Connues & Bonnes Pratiques

1. **Sans fournisseur de découverte Web configuré** (`SEARXNG_BASE_URL`, `BRAVE_SEARCH_API_KEY` ou `WEB_SEARCH_API_URL`), les jobboards en mode `link_only` (Meteojob, HelloWork, WTTJ, Apec, LinkedIn, Indeed, JobTeaser) fournissent des liens directs pré-paramétrés vers leurs moteurs officiels sans tenter d'extraire leurs pages.
2. **Respect des champs autorisés** : Sur les résultats de découverte externe, les durées, dates de début et URL directes de candidature ne sont jamais devinées (`null`).
3. **Endpoints Backend** :
   - `POST /api/search` : Exécute la collecte et retourne `{ offers, groundingUrls, externalSearchLinks, sourceLogs, jobBoardPolicies, stats }`.
   - `GET /api/sources/registry` : Expose la politique d'accès effective, les CGU et le statut d'autorisation de chaque jobboard.

---

## 6. Commandes & Tests

```bash
npm install
npm test        # Tests unitaires et d'intégration hors-ligne (ATS, JobBoards, Recherche, État UI)
npm run lint    # Vérification TypeScript (tsc --noEmit)
npm run build   # Build de production Vite
npm run dev     # Démarre le serveur Express + Vite sur http://localhost:3000
```
