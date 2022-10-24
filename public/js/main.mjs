import 'https://unpkg.com/navigo';

import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/input/input.js';
import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/icon/icon.js';
import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/icon-button/icon-button.js';
import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/alert/alert.js';

import * as s from './services.mjs';

const router = new Navigo('/', {hash: true});

router.on('/', function(){
  fetch('/getAll').then(response=>response.json())
    .then(result=>{
      // window.result = result;
      console.log(`got ${result.length} albums`)
      s.photogrid.paintPhotoGrid(result)
    })
  ;
})

// found at https://tutorial.eyehunts.com/js/call-javascript-function-on-enter-keypress-in-the-textbox-example-code/
let searchBox = document.getElementById("nav-search-box");
searchBox.addEventListener("keyup", function (e) {
 if (e.key === "Enter") {  
  performSearch()
 }
});

// full list: https://en.wikipedia.org/wiki/Percent-encoding#Percent-encoding_reserved_characters
function escapeURL(str){
  return str
    .replaceAll('%', '%25')
    .replaceAll('*', '%2A')
}

function performSearch(){
  let searchText = document.getElementById("nav-search-box").value;
  if(!searchText){
    alert("Enter search text");
    return;
  }
  router.navigate(`/search/${escapeURL(searchText)}`)
}

router.on('/search/:searchText', function({data}){
  fetch('/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({collection_id: 1, searchText: data.searchText}) // TODO: collection_id -- need to maintain state
  })
  .then(response=>response.json())
  .then(result=>{
    // window.result = result;
    console.log(`got ${result.length} albums`)
    s.photogrid.paintPhotoGrid(result)    
  })
});

router.resolve();
