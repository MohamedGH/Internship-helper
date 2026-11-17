import { JobBoardSourceConfig } from '../jobboards/jobBoardPolicy.ts';
import { PlatformAdapter } from './platformProvider.ts';
import {
  MultiQueryDiscoveryOptions,
  createDiscoveryOrLinkPlatformAdapter,
} from './genericSearchProvider.ts';

export const createLesJeudisProvider = (
  config: JobBoardSourceConfig,
  options: MultiQueryDiscoveryOptions = {}
): PlatformAdapter => createDiscoveryOrLinkPlatformAdapter(config, options);
