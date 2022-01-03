import {indexerDbFlush} from './indexer.mjs';
import {exiftool} from 'exiftool-vendored';
import {fileWatcherManagement} from './watcher.mjs';

export function shutdownCleanup(){
  // TODO: commit any pending changes
  indexerDbFlush();
  exiftool.end();
  fileWatcherManagement.stopAllWatchers();
}
