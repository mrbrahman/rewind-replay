import {EventEmitter} from 'events';

import {config} from '../config.mjs'
import { db } from './sqlite-database.mjs';
import {ProcessDataInChunks as chunks} from '../utils/process-data-in-chunks.mjs'

class EmitterClass extends EventEmitter {};
export const dbEvents = new EmitterClass();

dbEvents.on('ran', (_)=>{
  console.log(`DB Update ran. ${_} entries`)
});

const deleteFromMetadataStatement = `
delete from metadata
where uuid = @uuid
`;

const insertIntoMetadataStatement = `
insert into metadata
(
  collection_id, uuid, album, filename,
  description, filesize, ext, mimetype, mediatype,
  keywords, faces, objects, rating, imagesize, aspectratio,
  make, model, orientation, gpsposition, duration,
  region_applied_to_dimension_w, region_applied_to_dimension_h, region_applied_to_dimension_unit,
  datetime_original, create_date, file_modify_date, file_date
)
values
(
  @collection_id, @uuid, @album, @filename,
  @description, @filesize, @ext, @mimetype, @mediatype,
  @keywords, @faces, @objects, @rating, @imagesize, @aspectratio,
  @make, @model, @orientation, @gpsposition, @duration,
  @region_applied_to_dimension_w, @region_applied_to_dimension_h, @region_applied_to_dimension_unit,
  @datetime_original, @create_date, @file_modify_date, @file_date
)
`;

const deleteFromObjectDetailsStatement = `
delete from object_details
where uuid = @uuid
`;

const insertIntoObjectDetailsStatement = `
insert into object_details
(
  uuid, frame, how_found,
  region_name, region_type,
  region_area_x, region_area_y,
  region_area_w, region_area_h,
  region_area_unit
)
values
(
  @uuid, @frame, @how_found,
  @region_name, @region_type,
  @region_area_x, @region_area_y,
  @region_area_w, @region_area_h,
  @region_area_unit
)
`;
const deleteMetadata = db.prepare(deleteFromMetadataStatement);
const insertMetadata = db.prepare(insertIntoMetadataStatement);
const deleteObjectDetails = db.prepare(deleteFromObjectDetailsStatement);
const insertObjectDetails = db.prepare(insertIntoObjectDetailsStatement);

function transformDataToMetadataRow(row){
  ['faces','objects','keywords'].forEach(c=>{
    row[c] = JSON.stringify(row[c])
  });
  return row;
}

async function indexerDbTask(entries){
  let start = performance.now();

  let insertMany = db.transaction(
    function(tasks){
      for (let task of tasks) {
        if(task.action == 'delete'){
          deleteObjectDetails.run(task.data);
          deleteMetadata.run(task.data);
        } else if (task.action == 'del-insert'){
          // first clean-up any old entries
          deleteObjectDetails.run(task.data);
          deleteMetadata.run(task.data);
          
          insertMetadata.run( transformDataToMetadataRow(task.data) );

          if(task.data.parsedFaces){
            // TODO: create transformObjectDetailsToDb? what about uuid?
            task.data.parsedFaces.forEach(o=>insertObjectDetails.run({
              uuid: task.data.uuid,
              frame: '',                    // TODO: future use. may be this will help for video files?
              how_found: task.data.software,    // software that found this
              region_name: o.Name,
              region_type: o.Type,
              region_area_x: o.Area.X,
              region_area_y: o.Area.Y,
              region_area_w: o.Area.W,
              region_area_h: o.Area.H,
              region_area_unit: o.Area.Unit
            }));
          } // xmp
        }
      } // for loop
    } // end of function
  ); // db.transaction

  insertMany(entries);
  console.log(`DB update: Completed ${entries.length} entries in ${performance.now()-start} ms`)
  return entries.length
}

// expose a function to perform db activities in "chunks"
export const indexerDbWriteInChunks = chunks()
  .maxWaitTimeBeforeScoopMS(config.indexerDbUpdateTimeout)
  .maxItemsBeforeScoop(config.indexerDbUpdateChunk)
  .emitter(dbEvents)
  .invokeFunction( (_)=>indexerDbTask(_) )
;

// async function, so it can be run in background
export async function getIndexedFilesModifyTime(collection_id){
  let stmt = db.prepare(`
    select filename, uuid, file_modify_date
    from metadata
    where collection_id = ?
  `);

  let result = stmt.all(collection_id);

  // convert output into hash map
  return result.reduce(function(acc,curr){
    acc[curr.filename]={
      uuid: curr.uuid, 
      mtime: Math.floor( (new Date(curr.file_modify_date).getTime()) / 1000)  // Unix Epoch
    }; 
    return acc;
  }, {})
}

export function updateAlbum(collection_id, fromAlbum, toAlbum, updateFileName){
  let stmt = db.prepare(`
    update metadata
    set album = @toAlbum
      ${updateFileName ? ", filename = replace(filename, @fromAlbum, @toAlbum)" : ''} 
    where collection_id = @collection_id
    and album = @fromAlbum
  `);

  let updates = stmt.run({collection_id, fromAlbum, toAlbum});
  return updates;
}
