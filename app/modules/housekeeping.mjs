import { config } from '../config.mjs';

import { getAllCollections } from '../database/collection-db.mjs';
import {indexCollection, indexerDbFlush} from './indexer.mjs';
import {exiftool} from 'exiftool-vendored';
import {startWatchersForAllCollections, stopAllWatchers} from './watcher.mjs';

export async function startUpActivities(){
  // setup watch during start-up
  if(config.startFileWatcherAtStartup){
    startWatchersForAllCollections();
  }

  // Scan for file additions / changes and index them
  if(config.scanFilesForChangesAndIndexAtStartup){
    let collections = getAllCollections();
    for (let c of collections){
      indexCollection(c.collection_id, false);
    }
  }
}

export async function shutdownCleanup(){
  await indexerDbFlush();  // commit any pending indexing changes
  exiftool.end();
  stopAllWatchers();
}
