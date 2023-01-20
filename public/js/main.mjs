import 'https://unpkg.com/navigo';

// cherry-pick shoelace components
import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.87/dist/components/icon/icon.js';
import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.87/dist/components/icon-button/icon-button.js';
import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.87/dist/components/rating/rating.js';
import 'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.87/dist/components/alert/alert.js';

import {notify} from './utils.mjs';

import './pl-thumb.js';
import './pl-album.js';
import './pl-album-name.js';
import './pl-gallery.js';
import './pl-gallery-controls.js';
import './pl-slide.js';
import './pl-slideshow.js';

const router = new Navigo('/', {hash: true});

let state = {};

state.collection_id = 1; // until UI is implemented

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


function showGallery(data){
  state.galleryData = data;
  // window.galleryData = data;
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

document.getElementById('app').addEventListener('pl-gallery-item-clicked', (evt)=>{
  router.navigate(`/slideshow/${evt.detail.id}`)
});

document.getElementById('app').addEventListener('pl-slideshow-closed', ()=>{
  router.navigate(state.prevLink[0].url);
});

// 
// router paths
// 

router.on('/', function(){
  if(document.querySelector('pl-slideshow')){
    document.querySelector('pl-slideshow').remove();

    document.getElementById('nav-header').style.opacity = 1;
    document.getElementById('main-content').style.opacity = 1;
    return;
  }
  

  fetch('/getAll').then(response=>response.json())
    .then(result=>{
      showGallery(result);
    })
  ;
});

router.on('/search/:searchText', function(p){
  // TODO: eliminate duplicate code
  if(document.querySelector('pl-slideshow')){
    document.querySelector('pl-slideshow').remove();

    document.getElementById('nav-header').style.opacity = 1;
    document.getElementById('main-content').style.opacity = 1;
    return;
  }

  fetch('/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({collection_id: state.collection_id, searchText: p.data.searchText})
  })
  .then(response=>response.json())
  .then(result=>{
    showGallery(result);
  })
});

router.on('/slideshow/:startFrom', function(p){
  state.prevLink = router.lastResolved();
  
  document.getElementById('nav-header').style.opacity = 0;
  document.getElementById('main-content').style.opacity = 0;

  let s = Object.assign(document.createElement('pl-slideshow'), {
    data: state.galleryData,
    startFrom: p.data.startFrom,
    buffer: 3
  });

  // attaching this under app (not under main-content)
  document.getElementById('app').appendChild(s);
})

router.resolve();
