import * as db from '../database/search-db.mjs';

export function search(collection_id, searchStr){
  return db.runSearch(collection_id, searchStr);
}
