import * as s from './services.mjs';

const router = new Navigo('/');

router.on('/', function(){
  fetch('/getAll').then(response=>response.json())
    .then(result=>{
      console.log(`got ${result.length}`)
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

function performSearch(){
  let searchText = document.getElementById("search-box").value;
  if(!searchText){
    alert("Enter search text");
    return;
  }
  router.navigate(`/search/${searchText}`)
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
    console.log(`got ${result.length}`)
    s.photogrid.paintPhotoGrid(result)    
  })
});


// handle album name changes
// add a listener to the pig parent div
let nowEditing = false;
document.getElementById('pig-wrapper').addEventListener('click', function(e){
  // check if click was on the album name
  if(!nowEditing && e.target && e.target.matches('[contenteditable]')){
    nowEditing = true;
    let p = e.target;
    let origLabel = p.innerText.replaceAll(/(\n|<br>)/ig, '');

    // position to cursor to enable easy editing
    let len = origLabel.length;
    let tbd = origLabel.search(/(Sush Phone |Shreyas Phone )?TBD/g);

    var range = document.createRange()
    var sel = window.getSelection()

    range.setStart(p.childNodes[0], tbd >=0? tbd : len);
    range.setEnd(p.childNodes[0], len);
    sel.removeAllRanges();
    sel.addRange(range);
    
    p.onblur = async function updateAlbumName(){
      console.log('out-of-focus now');
      let newLabel = p.innerText.replaceAll(/(\n|<br>)/ig, '');
      console.log(`orig: ${origLabel} new: ${newLabel}`)

      if(origLabel!=newLabel){
        let updates = await fetch('/updateAlbumName', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({collection_id: 1, currAlbumName: origLabel, newAlbumName: newLabel})
        }).then(response=>response.json());
        
        console.log(`updated ${updates.changes} files`);

      } else {
        console.log('Album name unchanged')
      }
      nowEditing = false;
      this.removeEventListener('onblur', updateAlbumName)
    }

    console.log(`album name clicked: ${p.innerText}`)
  }
})

router.resolve();
