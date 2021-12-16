import { statSync } from 'fs';
import Database from 'better-sqlite3';

const dbFile = 'MEMORIES-DATABASE.sqlite';
const db = new Database(dbFile, {  }); // verbose: console.log

export function checkDbExists(){
  return statSync(dbFile).size > 0 ? true : false
}

export function dbSetup() {
  // collections go here
  var stmt = db.prepare(`
    create table if not exists collections (
      collection_id integer PRIMARY KEY AUTOINCREMENT,
      collection_name text,
      collection_path text NOT NULL UNIQUE, 
      album_type text, 
      listen_paths text,        -- stored as an array
      apply_folder_pattern,    -- TODO: need better names?
      default_collection integer
    )
  `);
  var info = stmt.run();
  
  // metadata (single record per file) goes here
  var stmt = db.prepare(`
    create virtual table if not exists metadata using fts5(
      collection_id, uuid, album, filename, 
      description, filesize, ext, mimetype, 
      keywords, faces, objects, rating, imagesize, aspectratio,
      make, model, orientation, gpsposition, duration,
      region_applied_to_dimension_w, region_applied_to_dimension_h, region_applied_to_dimension_unit,
      datetime_original, create_date, file_modify_date, file_date
    );
  `);
  var info = stmt.run();

  // object details (determined through ML) goes here
  var stmt = db.prepare(`
    create table object_details (
      uuid, frame, how_found,
      region_name text, region_type text,
      region_area_x real, region_area_y real,
      region_area_w real, region_area_h real
    )
  `);
  var info = stmt.run();

}

export function createNewCollection(entry){
  // convert listen path to SQLite json_array friendly format
  entry.listen_paths = JSON.stringify(entry.listen_paths)
  console.log(entry);

  var stmt = db.prepare(`
    insert into collections 
    (collection_name, collection_path, album_type, listen_paths, apply_folder_pattern, default_collection)
    values
    (@collection_name, @collection_path, @album_type, json(@listen_paths), @apply_folder_pattern, @default_collection)
  `);

  let info = stmt.run(entry);
  return info.lastInsertRowid;
}

export function getAllCollections(){
  // convert listen_paths back to JavaScript Array
  var stmt = db.prepare(`
    select collection_id, collection_name, collection_path, album_type, 
      listen_paths, apply_folder_pattern, default_collection 
    from collections
  `)
  let output = stmt.all();
  output.forEach(x => x.listen_paths = JSON.parse(x.listen_paths));
  return output;
  1;
}

export function getCollection(collection_id){
  // convert listen_paths back to JavaScript Array
  var stmt = db.prepare(`
    select collection_id, collection_name, collection_path, album_type, 
      listen_paths, apply_folder_pattern, default_collection 
    from collections where collection_id = ?
  `)
  let output = stmt.get(collection_id);
  output.listen_paths = JSON.parse(output.listen_paths);

  return output;
}

export function updateDefaultCollection(entries){
  // TODO
  console.log("TODO :-)")
}

const insertIntoMetadataStatement = `
insert into metadata
(
  collection_id, uuid, album, filename, 
  description, filesize, ext, mimetype, 
  keywords, faces, objects, rating, imagesize, aspectratio,
  make, model, orientation, gpsposition, duration,
  region_applied_to_dimension_w, region_applied_to_dimension_h, region_applied_to_dimension_unit,
  datetime_original, create_date, file_modify_date, file_date
)
values
(
  @collection_id, @uuid, @album, @filename, 
  @description, @filesize, @ext, @mimetype, 
  @keywords, @faces, @objects, @rating, @imagesize, @aspectratio,
  @make, @model, @orientation, @gpsposition, @duration,
  @region_applied_to_dimension_w, @region_applied_to_dimension_h, @region_applied_to_dimension_unit,
  @datetime_original, @create_date, @file_modify_date, @file_date
)
`;

export function createNewMetadata(entry){
  var stmt = db.prepare(insertIntoMetadataStatement);
  stmt.run(entry);
}

export function createNewMetadataBulk(entries){
  var stmt = db.prepare(insertIntoMetadataStatement);

  let insertMany = db.transaction(
    function(records){
      for (let entry of records) {
        stmt.run(entry);
      }
    }
  );

  insertMany(entries)
}
