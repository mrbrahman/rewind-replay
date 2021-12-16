import express from 'express';
import * as services from './app/services.mjs'

const app = express();

if (services.isFirstTimeRun()) {
  console.log("Setting up database");
  services.firstTimeSetup()
}

app.use(express.static('public'));

app.listen(9000, ()=>{
  console.log("Server started and listening in port 9000!");
});
