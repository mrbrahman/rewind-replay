import * as fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

import {config} from '../config.mjs'

// use the dbFile param, if one is available
// else see if there is a dataDir defined and create a file there
// else just create a 'data' directory in the main folder
const dbFile = config.dbFile || 
  config.dataDir ? 
    path.join(config.dataDir, 'MEMORIES-DATABASE.sqlite') :
    path.join('data', 'MEMORIES-DATABASE.sqlite')
;

if(!fs.existsSync(path.dirname(dbFile))){
  fs.mkdirSync(path.dirname(dbFile), {recursive: true})
}

export const db = new Database(dbFile, {  }); // verbose: console.log

// for first time run setup db
if(fs.statSync(dbFile).size == 0){
  dbSetup()
}

function dbSetup() {
  console.log("creating database ... ");

  // collections table
  var stmt = db.prepare(`
    create table if not exists collections (
      collection_id integer PRIMARY KEY AUTOINCREMENT,
      collection_name text,
      collection_path text NOT NULL UNIQUE,
      album_type text,
      listen_paths text,        -- stored as an array (JSON)
      apply_folder_pattern,     -- need to be 'dateformat' package compatible format
      default_collection integer,

      check (album_type in ('FOLDER_ALBUM', 'VIRTUAL_ALBUM'))
    )
  `);
  var info = stmt.run();

  // metadata (single record per file) table
  var stmt = db.prepare(`
    create virtual table if not exists metadata using fts5(
      collection_id, uuid, album, filename,
      description, filesize, ext, mimetype, mediatype,
      keywords, faces, objects, rating, imagesize, aspectratio,
      make, model, orientation, gpsposition, duration,
      region_applied_to_dimension_w, region_applied_to_dimension_h, region_applied_to_dimension_unit,
      datetime_original, create_date, file_modify_date, file_date
    );
  `);
  var info = stmt.run();

  // object details (determined through ML) table
  var stmt = db.prepare(`
    create table object_details (
      uuid, frame, how_found,
      region_name text, region_type text,
      region_area_x real, region_area_y real,
      region_area_w real, region_area_h real,
      region_area_unit text
    )
  `);
  var info = stmt.run();

}
