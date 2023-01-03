import 'https://unpkg.com/navigo';

// TODO: need to cherry-pick shoelace components
// import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.86/dist/components/rating/rating.js';
// import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/input/input.js';
// import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/icon/icon.js';
// import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/icon-button/icon-button.js';
// import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.83/dist/components/alert/alert.js';

import './pl-thumb.js';
import './pl-album.js';
import './pl-album-name.js';
import './pl-gallery.js';
import './pl-gallery-controls.js';

import {notify} from './utils.mjs';

const router = new Navigo('/', {hash: true});

router.on('/', function(){
  fetch('/getAll').then(response=>response.json())
    .then(result=>{
      showGallery(result);
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
    showGallery(result);
  })
});

router.resolve();

function showGallery(data){
  let c = document.getElementById('main-content');
  if(data.length == 0){
    c.innerHTML = "No results found";
    return;
  }
  
  document.getElementById("nav-search-box").blur();
  let g = Object.assign(document.createElement('pl-gallery'), { data });
  
  c.innerHTML = "";
  c.appendChild(g);

  notify(`Found ${data.length.toLocaleString()} albums containing ${data.map(x=>x.items.length).reduce((a,c)=>a+c).toLocaleString()} items`);
}
