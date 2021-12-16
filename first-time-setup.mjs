import * as s from './app/services.mjs';

s.firstTimeSetup()
var c = { 
  "collection_name": "Test", 
  "collection_path": "/home/shreyas/Projects/images-for-test/",
  "album_type": "FOLDER_ALBUM",
  "listen_paths": ["/home/shreyas/Downloads/"],
  "apply_folder_pattern": "yyyy/yyyy-mm-dd",
  "default_collection": 1 // true
}

var id = s.collections.createNewCollection(c);
console.log("id created ", id);

// verify:
console.log("verifying collection is created... ")
var colls = s.collections.getAllCollections();
console.log(colls);

s.indexer.indexCollectionFirstTime(id);
