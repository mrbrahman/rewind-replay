class PlSlide extends HTMLElement {
  #albumname; #data; #screenWidth; #screenHeight; #play;

  constructor() {
    super().attachShadow({mode: 'open'}); // sets "this" and "this.shadowRoot"
  }
  
  connectedCallback() {
    this.shadowRoot.appendChild(
      document.getElementById(this.nodeName).content.cloneNode(true)
    );
    
    this.shadowRoot.getElementById('albumname').innerText = this.albumname || '';
    this.shadowRoot.getElementById('rating').setAttribute('value', this.data.rating || 0);
    if(this.data.type.startsWith('image')){
      let img = Object.assign(document.createElement('img'), {
        src: `/getImage?uuid=${this.#data.id}&width=${this.#screenWidth}&height=${this.#screenHeight}`
      });

      this.shadowRoot.getElementById('media').appendChild(img);

    } else if (this.data.type.startsWith('video')){
      let video = Object.assign(document.createElement('video'), {
        width: this.#screenWidth,
        height: this.#screenHeight,
        controls: true,
        muted: false,
        preload: 'metadata'
      });

      let src = Object.assign(document.createElement('source'), {
        src: `/getVideo?uuid=${this.data.id}`,
        type: this.data.type
      });

      let txt = 'Cannot play video';
      video.append(src, txt);

      this.shadowRoot.getElementById('media').appendChild(video);

    } else {
      this.shadowRoot.getElementById('media').innerHTML = `<div>${this.data.type} TBD</div>`
    }
  }

  #playPauseMedia(){
    if(this.data.type.startsWith("video")){
      let media = this.shadowRoot.getElementById('media').firstElementChild;
      if(this.play){
        media.play();
      } else {
        media.pause();
      }
    } else {
      // ignore
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

  set albumname(_){
    this.#albumname = _;
  }
  get albumname(){
    return this.#albumname;
  }

  set data(_){
    this.#data = _;
  }
  get data(){
    return this.#data;
  }

  set screenWidth(_){
    this.#screenWidth = _;
  }
  get screenWidth(){
    return this.#screenWidth;
  }

  set screenHeight(_){
    this.#screenHeight = +_;
  }
  get screenHeight(){
    return this.#screenHeight;
  }

  set play(_){
    this.#play = Boolean(_);
    this.#playPauseMedia();
  }
  get play(){
    return this.#play;
  }

}

window.customElements.define('pl-slide', PlSlide);
