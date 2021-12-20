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

export function createNewMetadata(entry){
  var stmt = db.prepare(insertIntoMetadataStatement);
  stmt.run(entry);
}

export function createNewMetadataBulk(entries){
  var stmt = db.prepare(insertIntoMetadataStatement);

  let insertMany = db.transaction(
    function(records){
      for (let entry of records) {
        stmt.run(entry);
      }
    }
  );

  insertMany(entries)
}
