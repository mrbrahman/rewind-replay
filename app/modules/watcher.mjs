import chokidar from 'chokidar';

import {config} from '../config.mjs';
import {getAllCollections} from './collections.mjs';
import {addToIndexQueue} from './indexer.mjs';

export const fileWatcherManagement = watchers();

// setup watch during start-up
// TODO: change default to true
if(config.startFileWatcherAtStartup||false){
  fileWatcherManagement.startWatchersForAllCollections();
}

// not exporting the management function
function watchers(){
  // store an array of {collection_id: <id>, listen_path: <path>, watcher: <chokidar watcher>}
  let allWatchers = [];

  function my(){
    // nothing to do here
  }

  my.startWatchersForAllCollections = function(){
    let collections = getAllCollections();

    for(let c of collections){
      my.startWatcherForCollection(c);
    }
  }

  my.startWatcherForCollection = function(collection){
    for(let p of collection.listen_paths){
      let w = chokidar.watch(p) // TODO: ignore patterns
        .on('add', file=>{
          console.log(`watcher: ${file} is added`);
          addToIndexQueue(collection, file, false);
        });
      
      allWatchers.push({
        collection_id: collection.collection_id, 
        listen_path: collection.listen_paths, 
        watcher: w
      });
      console.log(`watcher for collection_id: ${collection.collection_id} listen_path: ${p} is now setup`)
    }
  }

  my.listAllWatchers = function(){
    return allWatchers;
  }

  my.stopAllWatchers = function(){
    allWatchers.map(async function(x){
      console.log(`closing watcher for collection_id: ${x.collection_id} listen_path: ${x.listen_path}`);
      await x['watcher'].close();
      console.log('watcher closed');
    })
  }

  return my;
}
