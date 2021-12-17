import * as db from './database/sqlite-database.mjs';

export function search(collection_id, searchStr){
  return db.runSearch(collection_id, searchStr);
}
