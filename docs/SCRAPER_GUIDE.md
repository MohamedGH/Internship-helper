# StagePilot — Web Scraping Search Architecture & Source Guide

StagePilot collects internship and stage offers using a modular, LLM-free web scraping engine under `server/search/`. Searching (`POST /api/search`) and application channel discovery (`POST /api/channels`) run deterministically with zero paid LLM API keys required.

---

## 1. Engine Architecture (`server/search/`)

- `scraperEngine.ts`: 11-step orchestration pipeline (target selection -> concurrent bounded collection -> normalization -> cross-source deduplication -> deterministic mandatory filtering -> 0–100 relevance scoring -> structured logs).
- `scraperRegistry.ts`: Maps selected built-in sources, policy-disabled external portals, and user-defined `CustomSource` configurations.
- **Public ATS API Connectors** (preferred over HTML scraping):
  - `connectors/greenhouseScraper.ts`: Queries `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` (Datadog, Mirakl, Dataiku, Algolia + custom Greenhouse URLs).
  - `connectors/leverScraper.ts`: Queries `https://api.lever.co/v0/postings/{slug}?mode=json` (Swile, Qonto, BlaBlaCar + custom Lever URLs).
  - `connectors/ashbyScraper.ts`: Queries `https://api.ashbyhq.com/posting-api/job-board/{boardName}?includeCompensation=true` (Alan, Mistral AI, Qonto, Pennylane, Dust + custom Ashby URLs).
- **Authorized HTML & Custom Source Connector**:
  - `connectors/genericHtmlScraper.ts`: Checks SSRF guard and `robots.txt` per origin, respects configurable `collectFrequencyMinutes` cache TTL, parses Schema.org `JobPosting` JSON-LD first, falls back to explicit custom CSS selectors or Cheerio heuristics, and performs bounded detail-page enrichment.
- **Extractors, Validators, Filters & Security**:
  - `extractors/jsonLdExtractor.ts`: Schema.org `JobPosting` parser (`@graph`, arrays, single objects).
  - `extractors/htmlExtractor.ts`: Cheerio CSS selector + career page link/email/ATS extractor.
  - `validators/offerVerifier.ts`: Distinguishes specific offer URLs from generic `/careers` landing pages, validates email syntax, assigns `VerificationStatus`.
  - `normalizer.ts`: Maps all offers to a strict schema where missing dates, duration, or contact fields remain `null` (never fabricated).
  - `filters/criteriaMatcher.ts`: Strict deterministic filtering (`Stage/Intern`, IT domain taxonomy, keywords, location/region/remote, min/max duration, start date window, skills) + relevance score (`0–100`).
  - `filters/deduplicator.ts`: Canonicalizes URLs (removes `utm_*`, `gh_src`, `ref`, etc.) and merges duplicates across sources.
  - `security/urlGuard.ts` & `security/robotsGuard.ts`: Blocks private/loopback/metadata IPs (`SSRF` protection) and enforces `robots.txt` `Allow`/`Disallow` and `Crawl-delay`.

---

## 2. Custom Source Configuration

Open **Add Custom Source** from the Discover search bar to configure:
1. **Name & Base URL**: Any public career portal, school board, or ATS link (`https://boards.greenhouse.io/<company>`, `https://jobs.lever.co/<company>`, `https://jobs.ashbyhq.com/<company>`).
2. **Search URL Template** (optional): Supports `{keywords}` and `{location}` placeholders.
3. **CSS Selectors** (optional): Override extraction with `jobListSelector`, `titleSelector`, `companySelector`, `locationSelector`, `linkSelector`, and `descriptionSelector`. Pages embedding `<script type="application/ld+json">` (`JobPosting`) are extracted automatically even without CSS selectors.
4. **Cache TTL (`collectFrequencyMinutes`)** & **Enable/Pause Toggle**: Controls how frequently the target URL is re-fetched.

---

## 3. Supported Sources vs. Policy & Technical Restrictions

| Source | Mode in StagePilot | Reason / Technical Status |
| :--- | :--- | :--- |
| **Company Career Page (Greenhouse, Lever, Ashby)** | **Active (Direct Public JSON API)** | Verified unauthenticated public job-board APIs returning structured titles, locations, descriptions, and direct application URLs. |
| **Custom Sources (Career Portals & JSON-LD Sites)** | **Active (Cheerio HTML / JSON-LD / ATS Auto-Detect)** | Scraped respectfully with `robots.txt` check, SSRF guard, per-domain rate throttling, and TTL caching. |
| **LinkedIn** | **Disabled by Policy (External Search Link)** | Automated scraping prohibited by ToS and anti-bot protections. Returns direct official search URL. |
| **Indeed** | **Disabled by Policy (External Search Link)** | Automated scraping blocked by anti-bot protections/WAF. Returns direct official search URL. |
| **Welcome to the Jungle (WTTJ)** | **Disabled by Policy (External Search Link)** | Protected dynamic frontend without open unauthenticated job search API. Returns direct official search URL. |
| **HelloWork** | **Disabled by Policy (External Search Link)** | WAF / anti-bot protection. Returns direct official search URL. |
| **JobTeaser** | **Disabled by Policy (External Search Link)** | Authenticated campus intranet portal; authentication is never bypassed. Returns direct official search URL. |

---

## 4. Running Locally & Testing

```bash
npm install
npm test        # Runs unit & integration tests across src/ and server/search/
npm run lint    # TypeScript type-check (tsc --noEmit)
npm run dev     # Starts Express API + Vite dev server on http://localhost:3000
```
