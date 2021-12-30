import {exiftool} from 'exiftool-vendored';
import {fileWatcherManagement} from './watcher.mjs'

export function shutdownCleanup(){
  exiftool.end();
  fileWatcherManagement.stopAllWatchers();
}
