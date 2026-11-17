import { JobBoardSourceConfig } from '../jobboards/jobBoardPolicy.ts';
import { WebSearchDiscoveryProvider } from '../jobboards/searchDiscoveryProvider.ts';
import { createAfjvProvider } from './afjvProvider.ts';
import { createApecProvider } from './apecProvider.ts';
import { createArbeitnowProvider } from './arbeitnowProvider.ts';
import { createFranceTravailPlatformProvider } from './franceTravailProvider.ts';
import { createGlassdoorProvider } from './glassdoorProvider.ts';
import { createHelloWorkProvider } from './helloworkProvider.ts';
import { createHimalayasProvider } from './himalayasProvider.ts';
import { createIndeedProvider } from './indeedProvider.ts';
import { createJobicyProvider } from './jobicyProvider.ts';
import { createJobTeaserProvider } from './jobteaserProvider.ts';
import { createLesJeudisProvider } from './lesjeudisProvider.ts';
import { createLinkedInProvider } from './linkedinProvider.ts';
import { createMeteojobProvider } from './meteojobProvider.ts';
import { PlatformAdapter, PlatformProviderOptions } from './platformProvider.ts';
import { createRemoteOkProvider } from './remoteOkProvider.ts';
import { createRemotivePlatformProvider } from './remotiveProvider.ts';
import { createWellfoundProvider } from './wellfoundProvider.ts';
import { createWeWorkRemotelyProvider } from './weWorkRemotelyProvider.ts';
import { createWttjProvider } from './wttjProvider.ts';

export interface PlatformRegistryOptions extends PlatformProviderOptions {
  readonly discoveryProvider?: WebSearchDiscoveryProvider | null;
}

export const createPlatformAdapterForConfig = (
  config: JobBoardSourceConfig,
  options: PlatformRegistryOptions = {}
): PlatformAdapter => {
  switch (config.id) {
    case 'france_travail':
      return createFranceTravailPlatformProvider(config, options);
    case 'afjv':
      return createAfjvProvider(config, options);
    case 'remotive':
      return createRemotivePlatformProvider(config, options);
    case 'remoteok':
      return createRemoteOkProvider(config, options);
    case 'weworkremotely':
      return createWeWorkRemotelyProvider(config, options);
    case 'arbeitnow':
      return createArbeitnowProvider(config, options);
    case 'himalayas':
      return createHimalayasProvider(config, options);
    case 'jobicy':
      return createJobicyProvider(config, options);
    case 'meteojob':
      return createMeteojobProvider(config, options);
    case 'apec':
      return createApecProvider(config, options);
    case 'hellowork':
      return createHelloWorkProvider(config, options);
    case 'wttj':
      return createWttjProvider(config, options);
    case 'lesjeudis':
      return createLesJeudisProvider(config, options);
    case 'jobteaser':
      return createJobTeaserProvider(config, options);
    case 'linkedin':
      return createLinkedInProvider(config, options);
    case 'indeed':
      return createIndeedProvider(config, options);
    case 'glassdoor':
      return createGlassdoorProvider(config, options);
    case 'wellfound':
      return createWellfoundProvider(config, options);
    default:
      return createMeteojobProvider(config, options);
  }
};
