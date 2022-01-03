import {exiftool} from 'exiftool-vendored';
import {fileWatcherManagement} from './watcher.mjs';

export function shutdownCleanup(){
  // TODO: commit any pending changes
  // dbMetadata.runNow();
  exiftool.end();
  fileWatcherManagement.stopAllWatchers();
}
