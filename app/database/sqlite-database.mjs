import * as fs from 'fs';
import * as parser from 'search-query-parser';
import Database from 'better-sqlite3';
import path from 'path';

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

const db = new Database(dbFile, {  }); // verbose: console.log

// TODO: Since this file is growing, split this by module?

export function checkDbExists(){
  return fs.statSync(dbFile).size > 0 ? true : false
}

export function dbSetup() {
  console.log("creating database ... ");

  // collections table
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

// TODO: remove multipe parsing of listen_path

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

export function getDefaultCollection(){
  // convert listen_paths back to JavaScript Array
  var stmt = db.prepare(`
    select collection_id, collection_name, collection_path, album_type,
      listen_paths, apply_folder_pattern, default_collection
    from collections where default_collection = 1
  `)
  let output = stmt.get();
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
  description, filesize, ext, mimetype, mediatype,
  keywords, faces, objects, rating, imagesize, aspectratio,
  make, model, orientation, gpsposition, duration,
  region_applied_to_dimension_w, region_applied_to_dimension_h, region_applied_to_dimension_unit,
  datetime_original, create_date, file_modify_date, file_date
)
values
(
  @collection_id, @uuid, @album, @filename,
  @description, @filesize, @ext, @mimetype, @mediatype,
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

function converToSQLQueryStr(searchStr){
  /*
    First cut features:
    1. When multiple conditions are prsent, by default they are "AND"ed.
        e.g. album:trip camera:samsung type:video
        will translate as
        {album}: "trip"* AND {camera}: "samsung"* AND {type}: "video"*
    2. This can be overwritten using the "logical" or "l" input. E.g. l:or
    3. The input from "logical" keyword applies to all conditions
        e.g. album:trip camera:samsung type:video l:or
        will translate as
        {album}: "trip"* OR {camera}: "samsung"* OR {type}: "video"*
    4. Input for a particular condition can contain multiple values, in which case they
       are "OR"ed.
        e.g. album:trip,vacation
        will translate as
        {album}: ("trip"* OR "vacation"*)
       It is not possible to change this behavior, and make this AND (currently)
    5. Any un-prefixed condition will be applied to all search-enabled columns
       in the restrictSearchCols array
    6. For advanced needs (including querying non restricted columns), use the "raw"
       input using SQLite FTS syntax. Thich will be used as-is in the filter.
        e.g. raw:"{album}: (states* AND trip*)"
       Note: there are quoting issues in search-query-parser library :-/
  */

  // TODO: implement facesLogical to contain OR, AND and ONLY conditions
  // implement date search including ranges

  const options = {
    keywords: ['album', 'keywords', 'tags', 'people', 'faces', 'type', 'mediatype', 'objects', 'rating', 'camera', 'make', 'model', 'date', 'on', 'l', 'logical', 'raw'],
    //ranges: ['between', 'dates'],  TODO:?
    alwaysArray: true,
    tokenize: true,
    offsets: false
  };

  // aliases: the right side (realCol) can also be known by the left side (alias)
  const aliases = {
    tags: 'keywords',
    people: 'faces',
    camera: 'make',
    type: 'mediatype',
    on: 'file_date',
    l: 'logical'
  }

  var parsedInput = parser.parse(searchStr, options);

  if (parsedInput.raw){
    return parsedInput.raw[0];
    // nothing else to do, ignore everything else given
  }

  // if query has used aliases, move them to appropriate real column
  for(const [alias,realCol] of Object.entries(aliases)){
    if(parsedInput[alias]){
      // the alias is found in search query
      if(parsedInput[realCol]){
        // there is an entry already for that realCol, hence join the 2 arrays
        parsedInput[realCol] = parsedInput[realCol].concat(parsedInput[alias])
      } else {
        // there is no entry for that realCol, make a new one
        parsedInput[realCol] = parsedInput[alias]
      }
      // now remove the alias
      delete parsedInput[alias];
    }
  }
  // also delete exclude until it is implemented
  delete parsedInput.exclude;

  // set "logical" and "facesLogical" values. These will be used during search
  let logical = parsedInput['logical'] ?
    parsedInput['logical'][0].toUpperCase() : // remember we set "alwaysArray: true" in search options
    'AND'  // by default, we use AND condition
  ;
  delete parsedInput.logical;

  // facesLogical valid values: OR, AND, ONLY
  // attempting to eventually implement:
  // OR: face1 or face2 must be present (others may also be present)
  // AND: face1 and face2 must be present (others may also be present)
  // ONLY: face1 and face2 must be present, and no others
  //    (this helps to identify family pics with only the required members)

  // let facesLogical=''
  // if(parsedInput['faces']){
  //   if(parsedInput['facesLogical']){
  //     facesLogical = parsedInput['facesLogical'][0].toUpperCase();
  //     delete parsedInput.facesLogical;
  //   } else {
  //     facesLogical = 'OR'
  //   }
  // }

  console.log(parsedInput);
  const restrictSearchCols = ['album', 'keywords', 'faces', 'objects', 'mediatype', 'rating', 'make', 'model', 'file_date'];

  // TODO: make this better?
  let conditions = [];
  for (let [col,val] of Object.entries(parsedInput)){
    let c = '',
      valQuotedAndStarred = val.map(x=>`"${x}"*`);

    if(restrictSearchCols.indexOf(col) >=0 ){
      c = `{${col}} : (${valQuotedAndStarred.join(' OR ')})`
    } else if (col == 'text'){
      // no prefix provided
      c = `{${restrictSearchCols.join(' ')}} : ( ${valQuotedAndStarred.join(' OR ')} )`
    }
    else {
      // silently ignore other nonsense
    }

    // add to conditions, if one is set
    if(c) conditions.push(c);
  }

  let final = conditions.join(` ${logical} `);
  return final

}

export function runSearch(collection_id, searchStr){
  let filters = [];
  
  if(collection_id)
    filters.push(`collection_id = ${collection_id}`);

  if(searchStr){
    let parsedCondition = converToSQLQueryStr(searchStr);
    console.log(parsedCondition);

    filters.push(`metadata MATCH '${parsedCondition}'`)
  }

  let sql = `
  select *
    -- uuid, album, filename, aspectratio, mimetype
  from metadata
  where ${filters.join(' and ')}
  `
  console.log(sql)
  var stmt = db.prepare(sql)
  
  return stmt.all()
}
