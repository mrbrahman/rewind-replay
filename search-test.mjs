import { search } from "./app/search-and-fetch.mjs";

var out = 
search(1, 'faces:sushama,shreyas,abhinav album:habba,festival abhinav l:or')
// search('raw:"{album keywords faces objects mediatype rating make model file_date} : ( sushama* )"')
// search(1, 'sushama')
console.log(out.length)

// parsing step 1
// str.replaceAll(/\s+(?=(?:(?:[^"]*"){2})*[^"]*"[^"]*$)/g, "__s_p_a_c_e__").split(/\s+/).map(x=>x.replaceAll(/__s_p_a_c_e__/g, ' '))

