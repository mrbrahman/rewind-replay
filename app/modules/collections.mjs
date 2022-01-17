import * as fs from 'fs';
import * as path from 'path';

import * as watcher from './watcher.mjs';
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
  watcher.startWatcherForCollection({collection_id: id, ...record});
  
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
