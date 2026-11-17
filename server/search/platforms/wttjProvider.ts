import { JobBoardSourceConfig } from '../jobboards/jobBoardPolicy.ts';
import { PlatformAdapter } from './platformProvider.ts';
import {
  MultiQueryDiscoveryOptions,
  createDiscoveryOrLinkPlatformAdapter,
} from './genericSearchProvider.ts';

export const createWttjProvider = (
  config: JobBoardSourceConfig,
  options: MultiQueryDiscoveryOptions = {}
): PlatformAdapter => createDiscoveryOrLinkPlatformAdapter(config, options);
