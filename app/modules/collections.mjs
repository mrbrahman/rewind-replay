import * as fs from 'fs';
import * as path from 'path';

import * as db from '../database/collection-db.mjs';

export function createNewCollection(record){
  if(!isValidDir(record.collection_path)){
    throw `${record.collection_path} is not a valid path in collection path`
  }

  for (let path of record.listen_paths){
    if(!isValidDir(path)){
      throw `${path} is not a valid path in listen path`
    }
  }

  let albumTypes = ['FOLDER_ALBUM','VIRTUAL_ALBUM']
  if(albumTypes.indexOf(record.album_type)<0){
    throw `${record.album_type} is invalid album type. Valid values are: ${albumTypes.join(', ')}`
  }
  
  let id = db.createNewCollection(record);
  return id;
} 

export function getAllCollections(){
  return db.getAllCollections()
}

export function getDefaultCollection(){
  return db.getDefaultCollection()
}

export function getCollection(collection_id){
  return db.getCollection(collection_id)
}

export function isValidDir(path){
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory()
}

export function listSubDirs(dir){
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(x => x.isDirectory())
    .map(x => x.name)
}

export function getFileCount(collection_id){
  let dir = getCollection(collection_id).collection_path
  return lsCnt(dir)
}

function lsCnt(dir){
  let ls = fs.readdirSync(dir, { withFileTypes: true });
  let files = ls.filter(x=>!x.isDirectory()).length;
  
  return files + ls.filter(x=>x.isDirectory())
    .map(d=>lsCnt(path.join(dir, d.name)))
    .reduce((acc,curr)=>acc+curr, 0)
}

function lsRecursive(dir){
  let ls = fs.readdirSync(dir, { withFileTypes: true });
  let files = ls.filter(x=>!x.isDirectory())
    .map( x=>path.join(dir,x.name) );
  
  return files.concat(
    ls.filter(x=>x.isDirectory())
    .map(x=>lsRecursive(path.join(dir, x.name)))  // recursive call
    .reduce((acc,curr)=>acc.concat(curr), []) )
}

export function listAllFilesForCollection(collection_id){
  let c = getCollection(collection_id);
  let files = lsRecursive(c.collection_path);

  return files;
}

export function listUpdatedFilesForCollection(collection_id){
  // TODO: is there a better way? chokidar?

  // Step 1: list all files and their modify times in collection

  // Step 2: Get files and modify times from db

  // Step 3: compare the two and determine which have been added/removed/modified
  let files = [];

  return files;
}

function removeDeletedFilesFromCollection(collection_id, files){
  /*   
    get uuid of all files; for each file:
      remove thumbnails
      remove faces?
      remove db entries 
  */
}
