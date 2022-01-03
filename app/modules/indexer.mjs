import * as fs from 'fs';
import * as path from 'path';
import {EventEmitter} from 'events';

import {v4 as uuidv4} from 'uuid';

import * as collections from './collections.mjs';
import * as m from './helpers/metadata.mjs';
import * as thumbs from './helpers/thumbnails.mjs';
import * as fileOps from './helpers/file-ops.mjs';

import { ParallelProcesses as pp } from '../utils/parallel-processes.mjs';
import {config} from '../config.mjs';
import * as db from '../database/indexer-db.mjs';

export let indexerDbFlush = ()=>db.indexerDbWriteInChunks.runNow();

class EmitterClass extends EventEmitter {};
export const indexerEvents = new EmitterClass();

export let indexerQueue = pp()
  .maxConcurrency(config.maxIndexPP||1)
  .emitter(indexerEvents)
;

// indexerEvents.on('start', (_)=>{console.log(`starting ${_}`)});
// indexerEvents.on('end', (_)=>{console.log(`finished ${_}`)});
// indexerEvents.on('all_done', (_)=>{console.log(`completed batch`)});

indexerEvents.on('error', (item, error)=>{
  console.log(`IndexerEvents got error: ${item} ${error}`);
  throw error;
})

export function addToIndexQueue(_){
  indexerQueue.enqueue(()=>indexFile(_))
}

async function indexFile(collection, sourceFileName, uuid, inPlace){
  // indexing is a series of steps, where the latter steps
  // are dependent on former steps
  
  console.log(`Indexing ${sourceFileName}`);
  let fileStart = performance.now();
  
  // Step 1: Read metadata from file
  var p = await m.getMetadata(sourceFileName);

  // Step 2: Use the metadata to physically move the file into collection. Determine album
  let f = fileOps.placeFileInCollection(collection, sourceFileName, p.file_date, inPlace);

  // Step 3: Generate uuid, and make metadata current
  p = {...p, ...f, uuid: uuid ? uuid : uuidv4(), collection_id: collection.collection_id}

  // Step 4: Video thumbnail extraction
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
  db.indexerDbWriteInChunks.add(p);

  console.log(`${sourceFileName} finished in ${performance.now()-fileStart} ms`);
}

export async function indexCollection(collection_id, firstTime=false){
  let c = collections.getCollection(collection_id);
  let files = [];

  if(firstTime){
    // save some time, and just get a list of all files
    files = {added: fileOps.listAllFilesForCollection(c), changed:[], deleted: []};
  } else {
    // painstakingly find out which files are added/updated/removed
    files = await fileOps.listDeltaFilesForCollection(c);
  }

  // add files to the indexer queue
  indexerQueue.enqueueMany(
    files['added'].map(f=>{
      return ()=>indexFile(c, f, null, true)
    })
  );

  indexerQueue.enqueueMany(
    files['changed'].map(f=>{
      return ()=>indexFile(c, f.filename, f.uuid, true);
    })
  );

  // TODO: handle deleted files
}

function removeDeletedFilesFromCollection(collection_id, files){
  /*   
    get uuid of all files; for each file:
      remove thumbnails
      remove faces?
      remove db entries 
  */
}
