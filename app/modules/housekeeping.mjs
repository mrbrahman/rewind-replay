import {indexerDbFlush} from './indexer.mjs';
import {exiftool} from 'exiftool-vendored';
import {stopAllWatchers} from './watcher.mjs';

export async function shutdownCleanup(){
  await indexerDbFlush();  // commit any pending indexing changes
  exiftool.end();
  stopAllWatchers();
}
