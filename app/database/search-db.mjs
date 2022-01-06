import * as parser from 'search-query-parser';

import { db } from './sqlite-database.mjs';

function converToSQLQueryStr(searchStr){
  /*
    First cut features:
    1. When multiple conditions are prsent, by default they are "AND"ed.
        e.g. album:trip camera:samsung type:video
        will translate as
        {album}: "trip"* AND {camera}: "samsung"* AND {type}: "video"*
    2. This can be overwritten using the "logical" or "l" input. E.g. l:or
    3. The input from "logical" keyword applies to all conditions
        e.g. album:trip camera:samsung type:video l:or
        will translate as
        {album}: "trip"* OR {camera}: "samsung"* OR {type}: "video"*
    4. Input for a particular condition can contain multiple values, in which case they
       are "OR"ed.
        e.g. album:trip,vacation
        will translate as
        {album}: ("trip"* OR "vacation"*)
       It is not possible to change this behavior, and make this AND (currently)
    5. Any un-prefixed condition will be applied to all search-enabled columns
       in the restrictSearchCols array
    6. For advanced needs (including querying non restricted columns), use the "raw"
       input using SQLite FTS syntax. Thich will be used as-is in the filter.
        e.g. raw:"{album}: (states* AND trip*)"
       Note: there are quoting issues in search-query-parser library :-/
  */

  // TODO: implement facesLogical to contain OR, AND and ONLY conditions
  // implement date search including ranges

  const options = {
    keywords: ['album', 'keywords', 'tags', 'people', 'faces', 'type', 'mediatype', 'objects', 'rating', 'camera', 'make', 'model', 'date', 'on', 'l', 'logical', 'raw'],
    //ranges: ['between', 'dates'],  TODO:?
    alwaysArray: true,
    tokenize: true,
    offsets: false
  };

  // aliases: the right side (realCol) can also be known by the left side (alias)
  const aliases = {
    tags: 'keywords',
    people: 'faces',
    camera: 'model',
    type: 'mediatype',
    on: 'file_date',
    l: 'logical'
  }

  var parsedInput = parser.parse(searchStr, options);

  if (parsedInput.raw){
    return parsedInput.raw[0];
    // nothing else to do, ignore everything else given
  }

  // if query has used aliases, move them to appropriate real column
  for(const [alias,realCol] of Object.entries(aliases)){
    if(parsedInput[alias]){
      // the alias is found in search query
      if(parsedInput[realCol]){
        // there is an entry already for that realCol, hence join the 2 arrays
        parsedInput[realCol] = parsedInput[realCol].concat(parsedInput[alias])
      } else {
        // there is no entry for that realCol, make a new one
        parsedInput[realCol] = parsedInput[alias]
      }
      // now remove the alias
      delete parsedInput[alias];
    }
  }
  // also delete exclude until it is implemented
  delete parsedInput.exclude;

  // set "logical" and "facesLogical" values. These will be used during search
  let logical = parsedInput['logical'] ?
    parsedInput['logical'][0].toUpperCase() : // remember we set "alwaysArray: true" in search options
    'AND'  // by default, we use AND condition
  ;
  delete parsedInput.logical;

  // facesLogical valid values: OR, AND, ONLY
  // attempting to eventually implement:
  // OR: face1 or face2 must be present (others may also be present)
  // AND: face1 and face2 must be present (others may also be present)
  // ONLY: face1 and face2 must be present, and no others
  //    (this helps to identify family pics with only the required members)

  // let facesLogical=''
  // if(parsedInput['faces']){
  //   if(parsedInput['facesLogical']){
  //     facesLogical = parsedInput['facesLogical'][0].toUpperCase();
  //     delete parsedInput.facesLogical;
  //   } else {
  //     facesLogical = 'OR'
  //   }
  // }

  console.error(parsedInput);
  const restrictSearchCols = ['album', 'keywords', 'faces', 'objects', 'mediatype', 'rating', 'make', 'model', 'file_date'];

  // TODO: make this better?
  let conditions = [];
  for (let [col,val] of Object.entries(parsedInput)){
    let c = '',
      valQuotedAndStarred = val.map(x=>`"${x}"*`);

    if(restrictSearchCols.indexOf(col) >=0 ){
      c = `{${col}} : (${valQuotedAndStarred.join(' OR ')})`
    } else if (col == 'text'){
      // no prefix provided
      c = `{${restrictSearchCols.join(' ')}} : ( ${valQuotedAndStarred.join(' OR ')} )`
    }
    else {
      // silently ignore other nonsense
    }

    // add to conditions, if one is set
    if(c) conditions.push(c);
  }

  let final = conditions.join(` ${logical} `);
  return final

}

export function runSearch(collection_id, searchStr){
  let filters = [];
  
  if(collection_id)
    filters.push(`collection_id = ${collection_id}`);

  if(searchStr){
    let parsedCondition = converToSQLQueryStr(searchStr);
    console.error(parsedCondition);

    filters.push(`metadata MATCH '${parsedCondition}'`)
  }

  let sql = `
  select *
    -- uuid, album, filename, aspectratio, mimetype
  from metadata
  where ${filters.join(' and ')}
  `
  console.error(sql)
  var stmt = db.prepare(sql)
  
  return stmt.all()
}

// photos grouped by album
// with t as (
//   select album, aspectratio, uuid, mimetype, file_date
//   from metadata
//   order by album desc, file_date desc
// )
// select album, 
//   json_group_array(
//     json_object(
//       'ar', round(aspectratio, 1), 
//       'id', uuid, 
//       'm', mimetype,
//       'fd', file_date
//     )
//   ) as json_files 
// from t
// order by album desc

export function getAllFromCollection(collection_id){
  let stmt = db.prepare(`
    select uuid as filename, aspectratio as aspectRatio, mimetype
    from metadata
    where collection_id = ?
    and mediatype in ('image', 'video')  -- TODO: add audio
    order by album desc, file_date
  `);

  return stmt.all(collection_id)
}
