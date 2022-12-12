class PlGalleryControls extends HTMLElement {
  #ctr; 

  constructor() {
    super().attachShadow({mode: 'open'}); // sets "this" and "this.shadowRoot"
  }

  connectedCallback() {
    this.shadowRoot.appendChild(
      document.getElementById(this.nodeName).content.cloneNode(true)
    );

    this.shadowRoot.getElementById("close")
      .addEventListener('click', this.#handleClose)
    ;

    this.shadowRoot.getElementById("rating")
      .addEventListener('sl-change', this.#handleRatingChanged)
    ;

    this.shadowRoot.getElementById("delete")
      .addEventListener('click', this.#handleDelete)
  }

  #handleClose = (evt)=>{
    let closed = new Event('pl-gallery-controls-closed', {composed: true, bubbles: true});
    this.dispatchEvent(closed);
  }

  #handleRatingChanged = (evt)=>{
    let newRating = evt.target.value;
    let ratingChanged = new CustomEvent('pl-gallery-controls-rating-changed', {
      composed: true, 
      bubbles: true,
      detail: {newRating}
    });
    this.dispatchEvent(ratingChanged);
  }

  #handleDelete = (evt)=>{
    let deleted = new Event('pl-gallery-events-delete-pressed', {composed: true, bubbles: true});
    this.dispatchEvent(deleted);
  }

  disconnectedCallback() {
    this.shadowRoot.getElementById("close")
      .removeEventListener('click', this.#handleClose)
    ;

    this.shadowRoot.getElementById("rating")
      .removeEventListener('sl-change', this.#handleRatingChanged)
    ;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    //implementation
  }

  adoptedCallback() {
    //implementation
  }

  #paintCtr(){
    this.shadowRoot.getElementById("ctr").innerHTML = this.ctr;
  }

  get ctr(){
    return this.#ctr;
  }
  set ctr(_){
    this.#ctr = +_;
    if(this.isConnected){
      this.#paintCtr();
    }
  }

}

window.customElements.define('pl-gallery-controls', PlGalleryControls);