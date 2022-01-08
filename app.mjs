import * as path from 'path';

import express from 'express';

import {config} from './app/config.mjs';
import * as s from './app/services.mjs'

const app = express();

app.use(express.static('public'));

app.get('/getAll', function(req,res){
  res.json(s.search.getAllFromDefaultCollection());
});

app.get('/getThumbnail', function(req,res){
  let {uuid, height} = req.query;
  // console.log(`inputs: uuid ${uuid} height ${height}`)
  let fileName = path.join(config.thumbsDir, ...Array.from(uuid).slice(0,3), `${uuid}_${height}_fit.jpg`);
  // console.log(`getting thumbnail: ${fileName}`)
  res.sendFile(fileName, {root: '.'});
})

app.listen(9000, ()=>{
  console.log("Server started and listening in port 9000!");
});
