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
let searchBox = document.getElementById("search-box");
searchBox.addEventListener("keyup", function (e) {
 if (e.key === "Enter") {  
  performSearch()
 }
});

let searchButton = document.getElementById("search-button");
searchButton.addEventListener("click", performSearch);

// full list: https://en.wikipedia.org/wiki/Percent-encoding#Percent-encoding_reserved_characters
function escapeHTML(str){
  return str
    .replaceAll('%', '%25')
    .replaceAll('*', '%2A')
}

function performSearch(){
  let searchText = document.getElementById("search-box").value;
  if(!searchText){
    alert("Enter search text");
    return;
  }
  router.navigate(`/search/${escapeHTML(searchText)}`)
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
