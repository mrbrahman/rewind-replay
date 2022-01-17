import chokidar from 'chokidar';

import {config} from '../config.mjs';
import {getAllCollections} from './collections.mjs';
import {addToIndexQueue} from './indexer.mjs';

// store an array of {collection_id: <id>, listen_path: <path>, watcher: <chokidar watcher>}
var allWatchers = [];

export function startWatchersForAllCollections(){
  let collections = getAllCollections();

  for(let c of collections){
    startWatcherForCollection(c);
  }
}

export function startWatcherForCollection(collection){
  for(let p of collection.listen_paths){
    let w = chokidar.watch(p) // TODO: ignore patterns
      .on('add', file=>{
        console.log(`watcher: ${file} is added`);
        addToIndexQueue(collection, file, null, false);
      })
    ;
    
    allWatchers.push({
      collection_id: collection.collection_id, 
      listen_path: collection.listen_paths, 
      watcher: w
    });
    console.log(`watcher for collection_id: ${collection.collection_id} listen_path: ${p} is now setup`);
  }
}

export function listAllWatchers(){
  return allWatchers;
}

export function stopAllWatchers(){
  allWatchers.map(async function(x){
    console.log(`closing watcher for collection_id: ${x.collection_id} listen_path: ${x.listen_path}`);
    await x['watcher'].close();
    console.log('watcher closed');
  })
}
