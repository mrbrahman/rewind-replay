import * as fs from 'fs';
import * as path from 'path';
import {EventEmitter} from 'events';

import dateformat from 'dateformat';
import {v4 as uuidv4} from 'uuid';

import * as collections from './collections.mjs';
import * as m from './helpers/metadata.mjs';
import * as thumbs from './helpers/thumbnails.mjs';

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

export function addToIndexQueue(collection, sourceFileName, inPlace){
  indexerQueue.enqueue(()=>indexFile(collection, sourceFileName, inPlace))
}

// TODO: should this function be exported? Is there a need for anyone 
// to call this directly without going through the Queue?

export async function indexFile(collection, sourceFileName, inPlace){
  // indexing is a series of steps, where the latter steps
  // are dependent on former steps
  
  console.log(`Indexing ${sourceFileName}`);
  let fileStart = performance.now();
  
  // Step 1: Read metadata from file
  var p = await m.getMetadata(sourceFileName);

  // Step 2: Use the metadata to physically move the file into collection. Determine album
  let f = placeFileInCollection(collection, sourceFileName, p.file_date, inPlace);

  // Step 3: Generate uuid, and make metadata current
  p = {...p, ...f, uuid: uuidv4(), collection_id: collection.collection_id}

  // TODO; Step 4: Video thumbnail extraction
  if(p.mediatype == "video" || p.mediatype == "image"){

    let imageFileName = p.filename;
    if(p.mediatype == "video"){
      // extract video thumbnail (screenshot) and use that image to extract image thumbs
      imageFileName = await thumbs.extratVideoThumbnail(p.uuid, sourceFileName);
      // TODO: need to overlay "play" button on video thumbnails
    }

    // read image once
    let buf = fs.readFileSync(imageFileName);
    
    // thumbnails generation
    await thumbs.createImageThumbnails(p.uuid, buf);

    // face region extraction (if present)
    if (p.xmpregion
      && p.xmpregion.RegionList.filter(d => d.Type == 'Face').length > 0
      && p.xmpregion.AppliedToDimensions.Unit == 'pixel') // TODO: don't know what to do with others just yet
    {
      let { W, H } = p.xmpregion.AppliedToDimensions;
      if (W != p.ImageWidth || H != p.ImageHeight) {
        // TODO: what should we do when RegionAppliedToDimensions don't match image height and width?
        console.warn(`${imageFileName} has different region dimensions! Actual ${p.ImageWidth}x${p.ImageWidth} vs ${W}x${H}`);
      }
      await thumbs.extractFaceRegions(p.uuid, buf, p.xmpregion);
    }

  }

  // Step 6: Make an entry in db
  db.dbMetadata.add(p);

  console.log(`${sourceFileName} finished in ${performance.now()-fileStart} ms`);
  // return p;   TODO: verify before removing this return statement
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

export async function indexCollection(collection_id, firstTime=false){
  let c = collections.getCollection(collection_id);
  let files = [];

  if(firstTime){
    // save some time, and just get a list of all files
    files = collections.listAllFilesForCollection(collection_id);
  } else {
    // painstakingly find out which files are added/updated/(removed also?)
    files = collections.listUpdatedFilesForCollection(collection_id);
  }

  // add files to the indexer queue
  indexerQueue.enqueueMany(
    files.map(f=>{
      return ()=>indexFile(c, f, true)
    })
  );
}
