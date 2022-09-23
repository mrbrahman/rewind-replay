// import Pig from './lib/pig.mjs';

let pigOptions = {
  spaceBetweenImages: 4,
  urlForSize: function(filename, size) {
    return `/getThumbnail?uuid=${filename}&height=${size}`
  },
  //groupTagName: 'album',
  enableGroupHeadline: true,
  getGroupHeadlineHTML: function(groupid) {
    // retain div in case I plan to add "save" and "undo" buttons later
    return `<div class="albumName"><p contenteditable="true" style="width:100vw">${groupid}</p></div>`;
  },
  newRowPerGroup: true
};

export function paintPhotoGrid(media){
  // remove pig
  let pigDiv = document.getElementById("pig");
  if(pigDiv){
    pigDiv.remove();
  }

  // add pig
  let div = document.createElement('div');
  div.id = 'pig';
  div.className = 'w3-container';

  let main = document.getElementById('pig-wrapper');
  main.appendChild(div)

  if(media.length>0){
    var pig = new Pig(media, pigOptions)
    pig.enable();
  } else {
    div.textContent = 'No results found...'
  }
}
