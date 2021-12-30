import { search } from "./app/services.mjs";

// to search on
// 'album', 'keywords', 'tags', 'people', 'faces', 'type', 'mediatype', 'objects', 'rating', 'camera', 'make', 'model', 'date', 'on', 'l', 'logical', 'raw'

var out = search.search(1, 'canon')

console.error(`Found ${out.length} entries`);

out.map(x=>console.log(`'${x.uuid}'`));

// parsing step 1
// str.replaceAll(/\s+(?=(?:(?:[^"]*"){2})*[^"]*"[^"]*$)/g, "__s_p_a_c_e__").split(/\s+/).map(x=>x.replaceAll(/__s_p_a_c_e__/g, ' '))

