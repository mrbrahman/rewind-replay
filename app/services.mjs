import * as db from './database/sqlite-database.mjs';

export function isFirstTimeRun(){
  return db.checkDbExists() ? false : true;
}

export function firstTimeSetup(){
  db.dbSetup()
}

export * as collections from './collections.mjs';
export * as indexer from './indexer-of-files.mjs';
