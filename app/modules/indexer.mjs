import * as fs from 'fs';
const fsPromises = fs.promises;
import {EOL} from 'os';
import {EventEmitter} from 'events';

import {v4 as uuidv4} from 'uuid';
import dateFormat from 'dateformat';

import * as collections from './collections.mjs';
import * as m from './helpers/metadata.mjs';
import * as thumbs from './helpers/thumbnails.mjs';
import * as fileOps from './helpers/file-ops.mjs';

import { ParallelProcesses as pp } from '../utils/parallel-processes.mjs';
import {config} from '../config.mjs';
import * as db from '../database/indexer-db.mjs';

// to be used in case of emergencies like shutdown, etc.
export let indexerDbFlush = ()=>db.indexerDbWriteInChunks.runNow();

class EmitterClass extends EventEmitter {};
export const indexerEvents = new EmitterClass();

let indexerQueue = pp()
  .maxConcurrency(config.maxIndexerConcurrency)
  .emitter(indexerEvents)
;

export function pauseIndexer(){
  indexerQueue.pause();
}

export function resumeIndexer(){
  indexerQueue.resume();
}

export function updateIndexerConcurrency(concurrency){
  let c = Number(concurrency)
  // update indexerQueue
  indexerQueue.maxConcurrency(c);

  // update config
  config.maxIndexerConcurrency=c;

  // TODO permananet storage?
}

export const indexerStatus = ()=>indexerQueue.status();

export const indexerErrors = [];

// indexerEvents.on('start', (_)=>{console.log(`starting ${_}`)});
// indexerEvents.on('end', (_)=>{console.log(`finished ${_}`)});
// indexerEvents.on('all_done', (_)=>{console.log(`completed batch`)});

let indexerBatchStart;

indexerEvents.on('start_batch', ()=>{
  indexerBatchStart = performance.now();
});

indexerEvents.on('all_done', ()=>{
  console.log(`Finished Indexer batch in ${(performance.now()-indexerBatchStart)/1000/60} mins`)
});

indexerEvents.on('error', (item, error)=>{
  console.log(`IndexerEvents got error: ${item} ${error}`);
  indexerErrors.push(error);
})

export function addToIndexQueue(collection, filename, uuid, inPlace){
  indexerQueue.enqueue(()=>indexFile(collection, filename, uuid, inPlace))
}

async function indexFile(collection, sourceFileName, uuid, inPlace){
  // indexing is a series of steps, where the latter steps
  // are dependent on former steps
  console.log(`Indexing ${sourceFileName}`);
  let fileStart = performance.now();
  
  // Step 1: Read metadata from file
  // unfortunately cannot pass buffer here
  try{
    var p = await m.getMetadata(sourceFileName);
  } catch(error){
    throw `ERROR during getMetadata for file: ${sourceFileName}: ${error}`;
  }

  // TODO: split this into i) get album name and ii) move the file to collection at the end
  // Step 2: Use the metadata to physically move the file into collection. Determine album
  try{
    var f = await fileOps.placeFileInCollection(collection, sourceFileName, p.file_date, inPlace);
  } catch(error){
    throw `ERROR during placeFileInCollection for file: ${sourceFileName}: ${error}`;
  }
  
  // Step 3: Generate uuid, and make metadata current
  try{
    p = {...p, ...f, uuid: uuid ? uuid : uuidv4(), collection_id: collection.collection_id}
  } catch(error){
    throw `ERROR during Generate uuid for file: ${sourceFileName}: ${error}`;
  }
  
  // Step 4: Video thumbnail extraction
  if(p.mediatype == "video" || p.mediatype == "image"){

    let imageFileName = p.filename, playImageOverlay=false;
    if(p.mediatype == "video"){
      try{
        // extract video thumbnail (screenshot) and use that image to extract image thumbs
        imageFileName = await thumbs.generateVideoThumbnail(p.uuid, p.filename);
        playImageOverlay=true;
      } catch(error){
        throw `ERROR during generateVideoThumbnail for file: ${sourceFileName}: ${error}`;
      }
    }

    // read image once
    let buf = fs.readFileSync(imageFileName);

    // thumbnails generation
    try{
      await thumbs.createImageThumbnails(p.uuid, buf, playImageOverlay);
    } catch(error){
      throw `ERROR during createImageThumbnails for file: ${sourceFileName}: ${error}`;
    }

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
      try{
        p.parsedFaces = await thumbs.extractFaceRegions(p.uuid, buf, p.xmpregion);
      } catch(error){
        throw `ERROR during extractFaceRegions for file: ${sourceFileName}: ${error}`;
      }
    }
  }
  
  // Step 6: Make an entry in db
  db.indexerDbWriteInChunks.add( {action: 'del-insert', data: p} );

  console.log(`${sourceFileName} finished in ${performance.now()-fileStart} ms`);
}

export async function deleteFromCollection(uuid){
  let start = performance.now();
  console.log(`DELETE: start to delete for uuid: ${uuid}`);

  let filename = db.getFileName(uuid);
  // TODO: read trash folder for collection, and if present, move file to trash
  // but we don't want to query the collection for every delete, so need to think of a better solution

  // cleanup thumbnails
  thumbs.deleteImageThumbnails(uuid);
  // delete faces
  thumbs.deleteFaceThumbnails(uuid);
  // remove from db
  db.indexerDbWriteInChunks.add( {action: 'delete', data: {uuid: uuid}} );

  // finally remove file
  // TODO: trash folder
  fileOps.deleteFile(filename);
  
  console.log(`Completed DELETE for ${uuid} in ${performance.now()-start} ms`);
}

export async function indexCollection(collection_id, firstTime=false){

  return new Promise(async (resolve, reject)=>{
    // TODO: should this accept a collection instead of collection_id?
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

    if(files['added'].length > 0){
      indexerQueue.enqueueMany(
        files['added'].map(f=>{
          return ()=>indexFile(c, f, null, true)
        })
      );
    }
    
    if(files['changed'].length > 0){
      indexerQueue.enqueueMany(
        files['changed'].map(f=>{
          return ()=>indexFile(c, f.filename, f.uuid, true);
        })
      );
    }
    
    if(files['deleted'].length > 0){
      indexerQueue.enqueueMany(
        files['deleted'].map(f=>{
          return ()=>deleteFromCollection(f.uuid);
        })
      );
    }

    resolve()
    
  })
}

export async function updateAlbum(collection_id, fromAlbum, toAlbum){
  let c = collections.getCollection(collection_id);
  
  if(c.album_type=="FOLDER_ALBUM"){
    fileOps.renameFolder(c, fromAlbum, toAlbum);
  
    // write out the changes to file
    // this may help in renaming any backups (for e.g. rsync backups) without having to delete and copy all files
    if(config.albumNameChangesFile){
      let f = await fsPromises.open(config.albumNameChangesFile, 'a');
      await fsPromises.appendFile(f, `${fromAlbum}\t${toAlbum}${EOL}`);
      f.close();
    }

  }
  
  return db.updateAlbum(
    collection_id, fromAlbum, toAlbum, 
    c.album_type=="FOLDER_ALBUM" ? true : false  // whether to update file name
  );
}

export let ignoreWatcherList = {};

// TODO: need to think of a generic function for other metadata as well
export async function updateRating(uuid, newRating){
  let fileName = db.getFileName(uuid);

  // make an entry to the ignore watcher list so that chokidar can ignore
  // the 'change' it sees on this file.
  ignoreWatcherList[fileName] = true;

  // we also update the file modify date so that next time server starts up, it doesn't
  // see this as a new file and re-indexes it
  let fileModifyDate = dateFormat(new Date(), 'isoDateTime');

  try{
    await m.updateMetadata(fileName, {Rating: newRating, FileModifyDate: fileModifyDate});
  } catch(err){
    // updates to metadata wasn't successful
    // remove file from ignore list and throw error
    delete(ignoreWatcherList[fileName]);
    throw err.message;
  }

  db.updateRating(uuid, newRating, fileModifyDate);

}