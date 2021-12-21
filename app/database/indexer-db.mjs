import { db } from './sqlite-database.mjs';

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

function transformMetadataToDb(row){
  ['faces','objects'].forEach(c=>{
    row[c] = JSON.stringify(row[c])
  });
  return row;
}

export function createNewMetadata(entry){
  var stmt = db.prepare(insertIntoMetadataStatement);
  stmt.run( transformMetadataToDb(entry) );
}

export function createNewMetadataBulk(entries){
  var stmt = db.prepare(insertIntoMetadataStatement);

  let insertMany = db.transaction(
    function(records){
      for (let entry of records) {
        stmt.run( transformMetadataToDb(entry) );
      }
    }
  );

  insertMany(entries)
}

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

export function createNewObjectDetailsBulk(entries){
  var stmt = db.prepare(insertIntoObjectDetailsStatement);

  let insertMany = db.transaction(
    function(records){
      for (let entry of records) {
        stmt.run(entry);
      }
    }
  );

  insertMany(entries)
}
