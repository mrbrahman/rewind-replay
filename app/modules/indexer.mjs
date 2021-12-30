import * as fs from 'fs';
import * as path from 'path';
import {EventEmitter} from 'events';

import dateformat from 'dateformat';
import {v4 as uuidv4} from 'uuid';
import {exiftool} from 'exiftool-vendored';

import * as collections from './collections.mjs';
import * as m from './helpers/metadata.mjs';
import * as thumbs from './helpers/extract-thumbnails-faces.mjs';

import { ParallelProcesses as pp } from '../utils/parallel-processes.mjs';
import {config} from '../config.mjs';
import * as db from '../database/indexer-db.mjs';

class EmitterClass extends EventEmitter {};
export const indexerEvents = new EmitterClass();

export let indexerQueue = pp()
  .maxConcurrency(config.maxIndexPP||1)
  .emitter(indexerEvents)
;

// indexerEvents.on('start', (_)=>{console.log(`starting ${_}`)});
// indexerEvents.on('end', (_)=>{console.log(`finished ${_}`)});
// indexerEvents.on('error', (_)=>{console.log(`error ${_}`)});
// indexerEvents.on('all_done', (_)=>{console.log(`completed batch`)});
indexerEvents.on('error', (item, error)=>{
  console.log(`IndexerEvents got error: ${item} ${error}`);
  throw error;
})

function lsRecursive(dir){
  let ls = fs.readdirSync(dir, { withFileTypes: true });
  let files = ls.filter(x=>!x.isDirectory())
    .map( x=>path.join(dir,x.name) );
  
  return files.concat(
    ls.filter(x=>x.isDirectory())
    .map(x=>lsRecursive(path.join(dir, x.name)))  // recursive call
    .reduce((acc,curr)=>acc.concat(curr), []) )
}

export async function indexCollectionFirstTime(collection_id){
  let c = collections.getCollection(collection_id);
  let files = lsRecursive(c.collection_path);
  
  indexerQueue.enqueueMany(
    files.map(f=>{
      return ()=>indexFile(c, f, true)
    })
  );
}


function placeFileInCollection(collection, filename, file_date, inPlace=false){
  let album, albumFilename,
    dir = path.dirname(filename);

  if(inPlace){
    // In place indexing. To be used for 
    // 1) first time in-place indexing after setting up collection
    // 2) collections that don't have specific listen_paths (i.e. new files come and 
    //    sit directly in the collection_path)

    album = collection.album_type=='FOLDER_ALBUM' ? 
      // relative folder becomes the album
      dir.replace(collection.collection_path, "").replace(/^\//, '') : 
      // album is just the date
      dateformat(file_date, 'yyyy-mm-dd');  // TODO: timezone?
  
      albumFilename = filename;
  } else {
    // i.e. file needs to be moved from listen_path to collection_path

    // extract format:
    // For FOLDER_ALBUM, need to move file to the corresponding folder
    // based on pattern specified in collection.
    // For VIRTUAL_ALBUM, files will sit in collection_path, i.e. there
    // is no sub-folder
    // TODO: For VIRTUAL_ALBUM, does it make sense to move to similar path like thumbnails?

    let subFolder = collection.album_type=='FOLDER_ALBUM' ? 
      dateformat(file_date, collection.apply_folder_pattern) : '';
    
    let newFolder = path.join(collection.collection_path, subFolder);
    let newFileName = path.join(newFolder, path.basename(filename));

    if(!fs.existsSync(newFolder)){
      fs.mkdirSync(newFolder, {recursive: true})
    }
    fs.renameSync(filename, newFileName);

    album = collection.album_type=='FOLDER_ALBUM' ? 
      // newly created sub folder becomes the album
      subFolder : 
      // album is just the date
      dateformat(file_date, 'yyyy-mm-dd');  // TODO: timezone?
      albumFilename = newFileName;
  }

  return {
    album: album,
    filename: albumFilename
  }
}

// TODO: To be used by chokidar
export function addToIndexQueue(collection, sourceFileName, inPlace){
  indexerQueue.enqueue(()=>indexFile(collection, sourceFileName, inPlace))
}

export async function indexFile(collection, sourceFileName, inPlace){
  // indexing is a series of steps, where the latter steps
  // are dependent on former steps
  
  console.log(`Indexing ${sourceFileName}`);
  let fileStart = performance.now();
  
  // Step 1: Read metadata from file
  var p = await m.getMetadata(exiftool, sourceFileName);

  // Step 2: Use the metadata to move the file to collection
  let f = placeFileInCollection(collection, sourceFileName, p.file_date, inPlace);

  // Step 3: Generate uuid, and make metadata current
  p = {...p, ...f, uuid: uuidv4(), collection_id: collection.collection_id}
  
  // TODO; Step 4: Video thumbnail extraction

  // Step 5: Generate thumbnails, extract faces ()
  if(p.mediatype == "image"){
    await thumbs.createAndSaveThumbnails(p)
  }

  // Step 6: Make an entry in db
  db.dbMetadata.add(p);

  console.log(`${sourceFileName} finished in ${performance.now()-fileStart} ms`);
  // return p;   TODO: verify before removing this return statement
}
