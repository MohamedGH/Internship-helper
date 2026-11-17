export interface ScrapeLogEvent {
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
  readonly source?: string;
  readonly connector?: string;
  readonly detail?: Record<string, unknown>;
}

export const logScrapeEvent = (payload: ScrapeLogEvent): void => {
  const entry = {
    ts: new Date().toISOString(),
    service: 'stagepilot-scraper',
    ...payload,
  };
  if (payload.level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (payload.level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.info(JSON.stringify(entry));
  }
};
