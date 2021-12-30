import * as s from './app/services.mjs';

import process from 'process';
import {exiftool} from 'exiftool-vendored';

function log(str){
  console.log(`${new Date()} ${str}`)
}

process.on('exit', ()=>{
  log('termination received');
  log('gracefully exiting ... ');
});

let e = s.indexer.indexerEvents;

e.on('all_done', ()=>{
  log('completed indexing, cleaning up');
  exiftool.end();
  s.fileWatcherManagement.stopAllWatchers();
});

s.fileWatcherManagement.startWatchersForAllCollections();
