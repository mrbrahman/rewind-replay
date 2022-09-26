import * as fs from 'fs';
const fsPromises = fs.promises;
import * as path from 'path';

import dateformat from 'dateformat';

import * as db from '../../database/indexer-db.mjs';

function lsRecursive(dir) {
  let ls = fs.readdirSync(dir, { withFileTypes: true });
  let files = ls.filter(x => !x.isDirectory())
    .map(x => path.join(dir, x.name));

  return files.concat(
    ls.filter(x => x.isDirectory())
      .map(x => lsRecursive(path.join(dir, x.name))) // recursive call
      .reduce((acc, curr) => acc.concat(curr), [])
  );
}

export function listAllFilesForCollection(collection) {
  let start = performance.now();
  console.log(`starting to list all files for collection path: ${collection.collection_path}`);

  let files = lsRecursive(collection.collection_path);
  
  console.log(`finished listing files in ${(performance.now() - start)/1000} secs`)

  return files;
}

async function getFilesMtime(dir) {
  let files = lsRecursive(dir);

  let result = files.map(f => {
    return {
      filename: f,
      file_modify_date: Math.floor(fs.statSync(f).mtimeMs / 1000) // Unix Epoch
    };
  });

  // convert output into hash map (Javascript Object)
  // {<filename_1>: {mtime: <file_modify_date_1>}, ... <filename_n>: {mtime: <file_modify_date_n>}}
  return result.reduce(function (acc, curr) {
    acc[curr.filename] = { mtime: curr.file_modify_date };
    return acc;
  }, {});
}

export async function listDeltaFilesForCollection(collection) {
  let start = performance.now();
  // Step 1: list all files and their modify times for collection
  let p1 = getFilesMtime(collection.collection_path);

  // Step 2: Get files and modify times from db
  let p2 = db.getIndexedFilesModifyTime(collection.collection_id);

  // Step 3: Wait for promises to complete
  let [physicalFiles, databaseEntries] = await Promise.all([p1, p2]);

  console.log(`physicalFiles ${Object.keys(physicalFiles).length} databaseEntries: ${Object.keys(databaseEntries).length}`);
  console.log(`Time taken to figure out files ${(performance.now()-start)/1000/60} mins`)

  // Step 4: compare the two and determine which have been added/removed/modified
  let added = [], changed = [], deleted = [];

  Object.keys(physicalFiles).forEach(f => {
    if (!(f in databaseEntries)) {
      added.push(f);
    } else if (physicalFiles[f].mtime > databaseEntries[f].mtime) {
      // console.log(`${f} is changed`)
      changed.push({ uuid: databaseEntries[f].uuid, filename: f });
    }
  });

  Object.keys(databaseEntries).forEach(f => {
    if (!(f in physicalFiles)) {
      // console.log(`${f} is deleted`)
      deleted.push({ uuid: databaseEntries[f].uuid, filename: f });
    }
  });

  return { added, changed, deleted };
}

export async function placeFileInCollection(collection, filename, file_date, inPlace=false){
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

    try {
      // try to fist rename the file. in case the file is in the same mountpoint
      // this will be faster than copying
      fs.renameSync(filename, newFileName);
    } catch (error) {
      // fs.renameSync does not work across mountpoints
      // first copy the file and then remove the original file
      // workaround found at https://stackoverflow.com/questions/43206198/what-does-the-exdev-cross-device-link-not-permitted-error-mean
      
      await fsPromises.cp(filename, newFileName, {preserveTimestamps: true});
      fs.unlinkSync(filename);
    }

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

export function renameFolder(collection, currAlbum, newAlbum){
  let currFolderName=path.join(collection.collection_path,currAlbum),
    newFolderName=path.join(collection.collection_path,newAlbum)
  ;
  
  fs.renameSync(currFolderName, newFolderName)
}
