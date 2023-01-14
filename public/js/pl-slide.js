class PlSlide extends HTMLElement {
  #albumname; #data; #screenWidth; #screenHeight;

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

        // let div = document.createElement('div');
        // div.classList = 'slide';
        // div.appendChild(img);

      } else {
        this.shadowRoot.getElementById('media').innerHTML = `<div>${this.data.type} TBD</div>`
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

}

window.customElements.define('pl-slide', PlSlide);
