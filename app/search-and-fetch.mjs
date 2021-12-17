import * as parser from 'search-query-parser';

export function serach(queryStr){
  const options = {
    keywords: ['album', 'keywords', 'tags', 'people', 'faces', 'objects', 'rating', 'camera', 'make', 'model', 'date', 'l', 'logical', 'facesLogical', 'raw'], 
    ranges: ['dates'],
    alwaysArray: true,
    tokenize: true,
    offsets: false
  };

  // aliases: the right side can also be known as the left side
  const aliases = {
    tags: 'keywords',
    people: 'faces',
    camera: 'make'
    ,l: 'logical'
  }
  const searchCols = ['album', 'keywords', 'faces', 'objects', 'rating', 'make', 'model', 'file_date'];

  var parsedQuery = parser.parse(queryStr, options);
  
  // if query has used aliases, move them to appropriate "keywords"
  for(const [key,value] of Object.entries(aliases)){
    if(parsedQuery[key]){
      // if the alias is set in search query
      if(parsedQuery[value]){
        // there is an entry already for that key, hence join the 2 arrays
        parsedQuery[value] = parsedQuery[value].concat(parsedQuery[key])
      } else {
        // there is no entry for that alias, make a new one
        parsedQuery[value] = parsedQuery[key]
      }
      // now remove the alias
      delete parsedQuery[key];
    }
  }
  
  // set "logical" and "facesLogical" values. These will be used during search
  parsedQuery['logical'] = parsedQuery['logical'] ? 
    parsedQuery['logical'][0].toUpperCase() : // remember we set "alwaysArray: true" in search options
    'OR'  // by default, we use OR condition
  ;

  // facesLogical valid values: OR, AND, ONLY
  // attempting to eventually implement:
  // OR: face1 or face2 must be present (others may also be present)
  // AND: face1 and face2 must be present (others may also be present)
  // ONLY: face1 and face2 must be present, and no others
  //    (this helps to identify family pics with only the required members)
  if(parsedQuery['faces']){
    parsedQuery['facesLogical'] = parsedQuery['facesLogical'] ? 
      parsedQuery['facesLogical'][0].toUpperCase() : 
      'OR'
    ;  
  }

  console.log(parsedQuery);

  // now we are ready to form the search query!

}