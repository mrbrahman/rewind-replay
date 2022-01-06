import { getDefaultCollection } from '../database/collection-db.mjs';
import * as db from '../database/search-db.mjs';

export function search(collection_id, searchStr){
  return db.runSearch(collection_id, searchStr);
}

export function getAllFromDefaultCollection(){
  let c = getDefaultCollection();
  return db.getAllFromCollection(c.collection_id);
}