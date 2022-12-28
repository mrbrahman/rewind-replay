import {notify} from './utils.mjs';

class PlAlbumName extends HTMLElement {

  #albumName; #albumSelectedValue='none';

  constructor() {
    super().attachShadow({mode: 'open'}); // sets "this" and "this.shadowRoot"
  }

  connectedCallback() {
    this.shadowRoot.appendChild(
      document.getElementById(this.nodeName).content.cloneNode(true)
    );

    this.#paintAlbumName();

    this.shadowRoot.getElementById("select-all").addEventListener('click', this.#handleSelectAll);
    
    this.shadowRoot.getElementById("album-name").addEventListener('focus', this.#handleFocus);
    this.shadowRoot.getElementById("album-name").addEventListener('blur', this.#handleBlur);
    this.shadowRoot.getElementById("album-name").addEventListener('keydown', this.#handleKey);

    this.shadowRoot.getElementById("save").addEventListener('click', this.#handleSave);

    this.shadowRoot.getElementById("cancel").addEventListener('click', this.#handleCancel);

  }

  #handleSelectAll = (evt) => {
    // toggle between 'all' and 'none'
    this.#albumSelectedValue = this.#albumSelectedValue == 'all' ? 'none' : 'all';
    this.#paintSelectAllCheckbox();

    let selectAllEvent = new CustomEvent('r3-select-all-clicked', {detail: {select: this.#albumSelectedValue == 'all' ? true : false}})
    this.dispatchEvent(selectAllEvent);
  }

  #handleSave = (evt) => {
    if(this.shadowRoot.getElementById('album-name').innerText == this.albumName){
      return;
    }

    // album name is changed, update in backend
    fetch('/updateAlbumName', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        collection_id: 1, // TODO: hardcoded for now, update this when "state" is implemented
        currAlbumName: this.#albumName,
        newAlbumName: this.shadowRoot.getElementById('album-name').innerText
      })
    }).then(res=>{
      // TODO: error message
      if(!res.ok){
        return Promise.reject(res.status+':'+res.statusText)
      }
      this.albumName = this.shadowRoot.getElementById('album-name').innerText;
      this.shadowRoot.getElementById('album-name').blur();
      this.shadowRoot.getElementById('edit-controls').style.visibility = 'hidden';

      notify('Album name updated successfully');
      
    }).catch(err=>{
      notify(`<strong>Error</strong>:</br>${err}`, 'danger', 'exclamation-octagon', -1);

    });

  }

  #handleCancel = (evt) => {
    if(this.shadowRoot.getElementById('album-name').innerText != this.albumName){
      this.shadowRoot.getElementById('album-name').innerText = this.albumName;
    }

    this.shadowRoot.getElementById('album-name').blur();
    this.shadowRoot.getElementById('edit-controls').style.visibility = 'hidden';
    window.getSelection().removeAllRanges();
  }

  // #handleHover = (evt) => {
  //   console.log('in handle hover')
  // }

  #handleFocus = (evt) => {
    this.shadowRoot.getElementById('edit-controls').style.visibility = 'visible';

    // position to cursor to enable easy editing
    let len = this.albumName.length;
    let tbd = this.albumName.search(/(Sush Phone |Shreyas Phone )?TBD/g);

    if(tbd>0){
      var range = document.createRange();
      var sel = window.getSelection();
  
      let albumNameText = this.shadowRoot.getElementById('album-name').childNodes[0];
  
      range.setStart(albumNameText, tbd >=0? tbd : len);
      range.setEnd(albumNameText, len);
      sel.removeAllRanges();
      sel.addRange(range);
    }

  }

  #handleBlur = (evt) => {
    // if there are changes made to album name and not saved, notify, else silently remove 
    if(this.shadowRoot.getElementById('album-name').innerText == this.albumName){
      this.shadowRoot.getElementById('edit-controls').style.visibility = 'hidden';
    }
    // else ... ideally notify that user needs to save, however, 
    // cannot notify here since blur is called even when save is pressed (before save is called)
  }

  #handleKey = (evt) => {
    if (evt.key == "Escape"){
      this.#handleCancel();
    } else if(evt.key == "Enter"){
      evt.preventDefault(); // we don't want an actual \n in the album name
      this.#handleSave();
    }
  }

  disconnectedCallback() {
    //implementation
  }

  attributeChangedCallback(name, oldVal, newVal) {
    //implementation
  }

  adoptedCallback() {
    //implementation
  }

  #paintAlbumName() {
    this.shadowRoot.getElementById('album-name').innerText = this.#albumName;
  }

  #paintSelectAllCheckbox(){
    let classes = ['select-none','select-some','select-all'];
    let checkbox = this.shadowRoot.getElementById('select-all');

    switch(this.#albumSelectedValue){
      case 'none':
        checkbox.name = "check-circle";
        checkbox.classList.remove(...classes);
        checkbox.classList.add('select-none');
        break;
      case 'some':
        checkbox.name = "check-circle-fill";
        checkbox.classList.remove(...classes);
        checkbox.classList.add('select-some');
        break;     
      case 'all':
        checkbox.name = "check-circle-fill";
        checkbox.classList.remove(...classes);
        checkbox.classList.add('select-all');
        break;
    }
  }

  get albumName() {
    return this.#albumName;
  }
  set albumName(_) {
    this.#albumName = _;

    if(this.isConnected){
      this.#paintAlbumName();
    }
  }

  get albumSelectedValue() {
    return this.#albumSelectedValue;
  }
  set albumSelectedValue(_){
    this.#albumSelectedValue = _;
    
    if(this.isConnected){
      this.#paintSelectAllCheckbox();
    }
  }

}

window.customElements.define('pl-album-name', PlAlbumName);
