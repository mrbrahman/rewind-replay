import { resizeImage } from './helpers/thumbnails.mjs';

import {getFileName} from '../database/indexer-db.mjs';
import {getDefaultCollection} from '../database/collection-db.mjs';
import * as db from '../database/search-db.mjs';

export function search(collection_id, searchStr){
  return db.runSearch(collection_id, searchStr);
}

export function getAllFromCollection(collection_id){
  return db.runSearch(collection_id)
}

export function getAllFromDefaultCollection(){
  let c = getDefaultCollection();
  return getAllFromCollection(c.collection_id);
}

export function getImage(uuid, width, height){
  let filename = getFileName(uuid);
  return resizeImage(filename, width, height);
}
