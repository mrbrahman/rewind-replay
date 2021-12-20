import * as fs from 'fs';
import * as path from 'path';
import * as dateformat from 'dateformat';
import {v4 as uuidv4} from 'uuid';
import {exiftool} from 'exiftool-vendored';

import * as collections from './collections.mjs';
import * as m from './metadata.mjs';
import * as thumbs from './generate-thumbnails.mjs';

import * as db from '../database/indexer-db.mjs'

function lsRecursive(dir){
  let ls = fs.readdirSync(dir, { withFileTypes: true });
  let files = ls.filter(x=>!x.isDirectory())
    .map( x=>{return {dir: dir, name: x.name, filename: path.join(dir,x.name), } } );
  
  return files.concat(
    ls.filter(x=>x.isDirectory())
    .map(x=>lsRecursive(path.join(dir, x.name)))  // recursive call
    .reduce((acc,curr)=>acc.concat(curr), []) )
}

export async function indexCollectionFirstTime(collection_id){
  let c = collections.getCollection(collection_id);
  var files = lsRecursive(c.collection_path);

  await indexFiles(c, files, true)
}

export async function indexFiles(collection, files, inPlace){
  let metadata = [];
  let start = performance.now();
  for (let f of files){
    let fileStart = performance.now();
    console.log(f.filename);
    
    let id = uuidv4();
    var p = await m.getMetadata(exiftool, f.filename);

    // Step 1: Organize the file, and determine album and filename
    let album, filename;
    if(inPlace){
      // In place indexing. To be used for 
      // 1) first time in-place indexing after setting up collection
      // 2) collections that don't have specific listen_paths (i.e. new files come and 
      //    sit directly in the collection_path)

      album = collection.album_type=='FOLDER_ALBUM' ? 
        // relative folder becomes the album
        f['dir'].replace(collection.collection_path, "").replace(/^\//, '') : 
        // album is just the date
        dateformat(file_date, 'yyyy-mm-dd');  // TODO: timezone?
    
      filename = f['filename']
    } else {
      // i.e. file needs to be moved from listen_path to collection_path

      // extract format:
      // For FOLDER_ALBUM, need to move file to the corresponding folder
      // based on pattern specified in collection.
      // For VIRTUAL_ALBUM, files will sit in collection_path, i.e. there
      // is no sub-folder

      let file_date = new Date(p.file_date);
      let subFolder = collection.album_type=='FOLDER_ALBUM' ? 
        dateformat(file_date, collection.apply_folder_pattern) : '';
      
      let newFolder = path.join(collection.collection_path, subFolder);
      let newFileName = path.join(newFolder, f.name);

      if(!fs.existsSync(newFolder)){
        fs.mkdirSync(newFolder, {recursive: true})
      }
      fs.renameSync(f.filename, newFileName);

      album = collection.album_type=='FOLDER_ALBUM' ? 
        // newly created sub folder becomes the album
        subFolder : 
        // album is just the date
        dateformat(file_date, 'yyyy-mm-dd');  // TODO: timezone?
      filename = newFileName;
    }

    p = {...p, 
      collection_id: collection.collection_id, 
      uuid: id, 
      album: album,
      filename: filename
    }
    metadata.push(p);

    // Step 2: Generate thumbnails
    if(p.mediatype == "image"){
      thumbs.exctractAndSaveThumbnails(p)
    }
    
    console.log(`${f.filename} finished in ${performance.now()-fileStart} ms`)
  }

  // Step 3: Bulk update the DB
  console.log("completed " + files.length + " files")
  db.createNewMetadataBulk(metadata);
  
  exiftool.end()
  console.log(`Total time taken ${(performance.now()-start)/1000} secs`)
}
