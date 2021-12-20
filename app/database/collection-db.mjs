import { db } from './sqlite-database.mjs';

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
