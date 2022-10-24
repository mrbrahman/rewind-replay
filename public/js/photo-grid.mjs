// import {} from './lib/pig.js';

let pigOptions = {
  scroller: document.getElementById("main-content"),
  spaceBetweenImages: 4,
  urlForSize: function(filename, size) {
    return `/getThumbnail?uuid=${filename}&height=${size}`
  },
  //groupTagName: 'album',
  enableGroupHeadline: true,
  getGroupHeadlineHTML: function(groupid) {
    // retain div in case I plan to add "save" and "undo" buttons later
    return `<div class="albumName"><p contenteditable="true" spellcheck="false" style="width:99vw">${groupid}</p></div>`;
  },
  newRowPerGroup: true
};

export function paintPhotoGrid(media){
  // get main content
  let mainContent = document.getElementById('main-content');

  // remove previous content
  mainContent.innerHTML = "";

  // add pig-wrapper
  let pigWrapper = document.createElement('div');
  pigWrapper.id = 'pig-wrapper'

  // add pig
  let pigDiv = document.createElement('div');
  pigDiv.id = 'pig';

  pigWrapper.appendChild(pigDiv);
  mainContent.appendChild(pigWrapper);

  if(media.length == 0){
    pigDiv.textContent = 'No results found...'
    return;
  }
  
  // we have the data, paint the grid
  var pig = new Pig(media, pigOptions)
  pig.enable();

  // handle album name changes
  // add a listener to the pig parent div
  let nowEditing = false;
  document.getElementById('pig-wrapper').addEventListener('click', function handleAlbumNameClick(e){
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

      function handleEscape(e) {
        if (e.key === "Escape") {  
        p.innerText = origLabel;
        this.blur();
        }
      }

      async function handleOnBlur(){
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
          
          console.log(`updated for ${updates.changes} files`);

        } else {
          console.log('Album name unchanged')
        }
        nowEditing = false;
        this.removeEventListener('blur', handleOnBlur);
        this.removeEventListener('keyup', handleEscape);
      }

      p.addEventListener("keyup", handleEscape);
      p.addEventListener("blur", handleOnBlur);
      
      console.log(`album name clicked: ${p.innerText}`)
    }

  });

}
