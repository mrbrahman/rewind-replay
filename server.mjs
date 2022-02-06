import * as path from 'path';

import express from 'express';

import {config} from './app/config.mjs';
import * as s from './app/services.mjs'

const server = express();

server.use(express.json())
server.use(express.static('public'));

// TODO: validate request parameters in all relevant functions?

// *****************************************
// search, and thumbnails
// *****************************************

// TODO: rename this
server.get('/getAll', function(req,res){
  res.json(s.search.getAllFromDefaultCollection());
});

server.get('/getThumbnail', function(req,res){
  let {uuid, height} = req.query;
  // console.log(`inputs: uuid ${uuid} height ${height}`)
  let fileName = path.join(config.thumbsDir, ...Array.from(uuid).slice(0,3), `${uuid}_${height}_fit.jpg`);
  // console.log(`getting thumbnail: ${fileName}`)
  res.sendFile(fileName, {root: '.'});
});

server.get('/search/:searchText', function(req,res){
  let {searchText} = req.params;
  res.json(s.search.search(1, searchText)); // TODO: collection_id
})

// *****************************************
// collection functions
// *****************************************
server.post('/createNewCollection', function(req,res,next){
  let c = req.body;
  try {
    let id = s.collections.createNewCollection(c)
    res.json(id)
  } catch (error){
    next(error);
  }
});

server.get('/getAllCollections', function(req,res){
  res.json( s.collections.getAllCollections() )
});


// *****************************************
// indexer functions
// *****************************************

server.post('/startIndexingFirstTime', async function(req,res){
  let {collection_id} = req.query;
  s.indexer.indexCollection(collection_id, true);
  res.sendStatus(200);
});

server.get('/getIndexerStatus', function(req,res){
  res.json(s.indexer.indexerStatus());
});

server.put('/pauseIndexer', function(req,res){
  s.indexer.pauseIndexer();
  res.sendStatus(200);
});

server.put('/resumeIndexer', function(req,res){
  s.indexer.resumeIndexer();
  res.sendStatus(200);
});

server.put('/updateIndexerConcurrency/:concurrency', function(req,res,next){
  let concurrency = +req.params.concurrency;

  if(concurrency){
    s.indexer.updateIndexerConcurrency(concurrency);
  }
  res.sendStatus(200);
});

// *****************************************
// album organization
// *****************************************
server.post('/updateAlbumName', function(req,res){
  let {collection_id, currAlbumName, newAlbumName} = req.body;
  let updates = s.indexer.updateAlbum(collection_id, currAlbumName, newAlbumName);

  res.json(updates);
});


// *****************************************
// start server
// *****************************************

process.on('SIGINT', async function(){
  console.log('***** Interrupt signal received **** ')
  await s.housekeeping.shutdownCleanup();
  server.close;
  console.log('Server shutdown. Ending process... ');
  process.exit(0)
});

server.listen(9000, ()=>{
  console.log("Server started and listening in port 9000!");
  // Perform startup activities
  s.housekeeping.startUpActivities();
});
