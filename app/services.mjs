import * as db from './database/sqlite-database.mjs';

export function isFirstTimeRun(){
  return db.checkDbExists() ? false : true;
}

export function firstTimeSetup(){
  db.dbSetup()
}

export * as collections from './modules/collections.mjs';
export * as indexer from './modules/indexer-of-files.mjs';
