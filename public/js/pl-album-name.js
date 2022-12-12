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
    if(this.shadowRoot.getElementById('album-name').innerText != this.albumName){
      console.log('TODO: save in db');
      this.albumName = this.shadowRoot.getElementById('album-name').innerText;
      // TODO: notify of successful change
    }

    this.shadowRoot.getElementById('album-name').blur();
    this.shadowRoot.getElementById('edit-controls').style.visibility = 'hidden';
  }

  #handleCancel = (evt) => {
    if(this.shadowRoot.getElementById('album-name').innerText != this.albumName){
      this.shadowRoot.getElementById('album-name').innerText = this.albumName;
    }

    this.shadowRoot.getElementById('album-name').blur();
    this.shadowRoot.getElementById('edit-controls').style.visibility = 'hidden';
  }

  // #handleHover = (evt) => {
  //   console.log('in handle hover')
  // }

  #handleFocus = (evt) => {
    this.shadowRoot.getElementById('edit-controls').style.visibility = 'visible';
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
