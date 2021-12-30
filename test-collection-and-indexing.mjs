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

var c = { 
  "collection_name": "Test", 
  "collection_path": "/home/shreyas/Projects/images-for-test/",
  "album_type": "FOLDER_ALBUM",
  "listen_paths": ["/home/shreyas/Downloads/"],
  "apply_folder_pattern": "yyyy/yyyy-mm-dd",
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
e.on('all_done', ()=>{
  log('completed indexing')
  exiftool.end();
});

s.indexer.indexCollectionFirstTime(id);
log("started indexer");
