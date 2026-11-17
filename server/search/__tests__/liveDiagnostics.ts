import { runScrapingSearch } from '../scraperEngine.ts';
import { getJobBoardPolicySnapshots } from '../jobboards/jobBoardSearch.ts';
import { SearchCriteria } from '../types.ts';

const runLiveDiagnostics = async (): Promise<void> => {
  const criteria: SearchCriteria = {
    keywords: 'Stage Développement Web React Full-Stack',
    location: 'Paris / Remote',
    workMode: 'all',
    minDurationMonths: 2,
    maxDurationMonths: 6,
    domains: ['Développement web', 'Développement logiciel', 'Data'],
    skills: ['TypeScript', 'React', 'Node.js', 'Python', 'SQL'],
    includeExternalDiscovery: true,
    sources: [
      'Company Career Page',
      'France Travail',
      'AFJV',
      'Meteojob',
      'Apec',
      'Welcome to the Jungle',
      'HelloWork',
      'LesJeudis',
      'Remotive',
      'Remote OK',
      'We Work Remotely',
      'Arbeitnow',
      'Himalayas',
      'Jobicy',
      'JobTeaser',
      'LinkedIn',
      'Indeed',
      'Glassdoor',
      'Wellfound',
    ],
  };

  console.log('=== StagePilot Live Multi-Platform Diagnostic Run ===');
  console.log('Timestamp:', new Date().toISOString());

  const result = await runScrapingSearch(criteria, {
    concurrency: 5,
    connectorTimeoutMs: 18_000,
  });

  console.log('\nQueries Executed:', result.queriesExecuted?.join(' | '));
  console.log('\n--- Per-Connector Telemetry ---');
  for (const log of result.sourceLogs) {
    console.log(
      `${log.source.padEnd(24)} | ${(log.accessMode ?? 'unknown').padEnd(14)} | ${log.status.padEnd(10)} | collected=${String(log.collectedCount).padStart(4)} | matched=${String(log.matchedCount).padStart(3)} | ${String(log.durationMs).padStart(5)}ms | ${log.message ?? ''}`
    );
  }

  console.log('\n--- Summary Stats ---');
  console.log(JSON.stringify(result.stats, null, 2));

  console.log('\n--- Top 10 Matched Real Offers ---');
  for (const offer of result.offers.slice(0, 10)) {
    console.log(
      `[${offer.matchScore}%] ${offer.organization} — ${offer.title} (${offer.location}, ${offer.workMode}) [${offer.sources.join(', ')}] -> ${offer.sourceUrl}`
    );
  }

  console.log('\n--- Policy Snapshots (Active Access Modes) ---');
  for (const pol of getJobBoardPolicySnapshots()) {
    console.log(
      `${pol.name.padEnd(22)} | ${pol.accessMode.padEnd(13)} | ${pol.authorizationStatus}`
    );
  }
};

runLiveDiagnostics().catch((err) => {
  console.error('Live diagnostic failed:', err);
  process.exitCode = 1;
});
