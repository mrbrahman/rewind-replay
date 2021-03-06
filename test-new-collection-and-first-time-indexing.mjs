import * as s from './app/services.mjs';
import process from 'process';

function log(str){
  console.log(`${new Date()} ${str}`)
}

process.on('exit', ()=>{
  log('termination received');
  log('gracefully exiting ... ');
});

var c = { 
  "collection_name": "Test", 
  "collection_path": "/home/shreyas/Projects/test-collection/",
  "album_type": "FOLDER_ALBUM",
  "listen_paths": ["/home/shreyas/Projects/test-collection-new-files/"],
  "apply_folder_pattern": "yyyy/yyyy-mm-dd 'TBD'",
  "default_collection": 1 // true
}

var id = s.collections.createNewCollection(c);
log("id created ", id);

// verify:
console.log("verifying collection is created... ")
var colls = s.collections.getAllCollections();
console.log(colls);

// setup indexer event listener
// Because of https://github.com/photostructure/exiftool-vendored.js/issues/106
// this will need to be done in all places that uses indexer
// for e.g. main app, test suites etc

let e = s.indexer.indexerEvents;
e.on('all_done', async ()=>{
  log('completed indexing, calling shutdown housekeeping')
  await s.housekeeping.shutdownCleanup();
});

s.indexer.indexCollection(id, true);
log("started indexer");
