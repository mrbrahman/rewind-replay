import * as fs from 'fs';
import * as path from 'path';
import * as dateformat from 'dateformat';
import {v4 as uuidv4} from 'uuid';
import {exiftool} from 'exiftool-vendored';

import * as collections from './collections.mjs';
import * as m from './metadata.mjs';
import * as thumbs from './extract-thumbnails-faces.mjs';

import * as db from '../database/indexer-db.mjs'

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
  let indexStart = performance.now(), indexResult = [];

  for(let f of files){
    let indexedData = await indexFile(c, f, true);
    indexResult.push(indexedData);
  }

  dbUpdate(indexResult)
  
  // TODO: place this properly
  exiftool.end();
  console.log(`Total time taken ${(performance.now()-indexStart)/1000} secs`)
}

function dbUpdate(arrMetadata){
  let objectMetadata = [];
  
  let dbStart = performance.now();
  db.createNewMetadataBulk(arrMetadata);

  arrMetadata.forEach(d=>{
    if(d.xmpregion){
      d.xmpregion.RegionList.forEach(o=>objectMetadata.push({
        uuid: d.uuid,
        frame: '', // TODO: check why I created this field
        how_found: d.software,    // legacy software that created this
        region_name: o.Name,
        region_type: o.Type,
        region_area_x: o.Area.X,
        region_area_y: o.Area.Y,
        region_area_w: o.Area.W,
        region_area_h: o.Area.H,
        region_area_unit: o.Area.Unit
      }));
    }
  });
  
  if(objectMetadata.length>0){
    db.createNewObjectDetailsBulk(objectMetadata);
  }
  console.log(`DB Update completed ${performance.now()-dbStart} ms`)
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

    let subFolder = collection.album_type=='FOLDER_ALBUM' ? 
      dateformat(file_date, collection.apply_folder_pattern) : '';
    
    let newFolder = path.join(collection.collection_path, subFolder);
    let newFileName = path.join(newFolder, path.basename(filename));

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

  return {
    album: album,
    filename: albumFilename
  }
}

export async function indexFile(collection, sourceFileName, inPlace){
  // indexing is a series of steps, where the latter steps
  // are dependent on former steps
  
  let arrMetadata = [], objectMetadata = [];
  
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

  console.log(`${sourceFileName} finished in ${performance.now()-fileStart} ms`);
  return p;
}
