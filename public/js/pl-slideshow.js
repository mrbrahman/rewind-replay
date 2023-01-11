class PlSlideshow extends HTMLElement {
  #data=[]; #src; #startFrom; #buffer=1; #loop=false;
  #startIdx=[0,0]; #screenWidth; #screenHeight;

  constructor() {
    super().attachShadow({mode: 'open'}); // sets "this" and "this.shadowRoot"
  }

  connectedCallback() {
    this.shadowRoot.appendChild(
      document.getElementById(this.nodeName).content.cloneNode(true)
    );

    if(this.data.length == 0){
      return;
    }

    if(this.startFrom){
      this.#startIdx = this.#getIndexOfK(this.data, this.startFrom);
    }

    this.#screenHeight = document.documentElement.clientHeight;
    this.#screenWidth  = document.documentElement.clientWidth;

    console.log(`startIdx: ${this.#startIdx}`);
    console.log(`height: ${this.#screenHeight} width: ${this.#screenWidth}`)
    // console.log(`data length: ${this.data.length}`);
    // console.log(this.data);

    let slide = this.#createSlide(this.#startIdx);
    slide.classList.add('active');
    slide.dataset.pos = 0;
    slide.dataset.idx = this.#startIdx.toString();
    this.shadowRoot.getElementById('slides').append(slide);

    // paint subsequent slides first (assume the default direction is ltr)
    let currIdx = this.#startIdx;
    for(let i=1; i<=this.buffer; i++){

      let nextIdx = this.#nextIdx(currIdx);
      if(nextIdx){
        let nextSlide = this.#createSlide(nextIdx);
        nextSlide.classList.add('right');
        nextSlide.dataset.pos = i;
        nextSlide.dataset.idx = nextIdx.toString();
        this.shadowRoot.getElementById('slides').append(nextSlide);
        
        currIdx = nextIdx;
      } else {
        break;
      }
    }

    // now paint previous slides
    currIdx = this.#startIdx;
    for(let i=-1; i>=-this.buffer; i--){
      let prevIdx = this.#prevIdx(currIdx);
      if(prevIdx){
        let prevSlide = this.#createSlide(prevIdx);
        prevSlide.classList.add('left');
        prevSlide.dataset.pos = i;
        prevSlide.dataset.idx = prevIdx.toString();
        this.shadowRoot.getElementById('slides').append(prevSlide);

        currIdx = prevIdx;
      } else {
        break;
      }
    }

    this.shadowRoot.getElementById('next').addEventListener('click', ()=>this.#next())
    this.shadowRoot.getElementById('prev').addEventListener('click', ()=>this.#prev())

    window.addEventListener('keydown', this.#handleRightArrow);
    window.addEventListener('keydown', this.#handleLeftArrow);
  }

  #handleRightArrow = (evt)=>{
    if(evt.key == "ArrowRight"){
      this.#next();
    } else {
      // ignore
    }
    
  }

  #handleLeftArrow = (evt)=>{
    if(evt.key == "ArrowLeft"){
      this.#prev();
    } else {
      // ignore
    }
    
  }

  // Adapted from https://stackoverflow.com/a/16102526/8098748
  #getIndexOfK(arr, k) {
    for (var i = 0; i < arr.length; i++) {
      var index = arr[i].items.findIndex(e=>e.id==k);
      if (index > -1) {
        return [i, index];
      }
    }
  }

  #nextIdx(idx){
    let arr = this.data;

    if(arr[idx[0]].items[idx[1]+1]){
      return [idx[0], idx[1]+1];  // next item in the current album
    } else if(arr[idx[0]+1]) {
      return [idx[0]+1, 0]        // first item in the next album
    } else {
      if(this.#loop){
        return [0,0];             // first item of the first album
      }
      return undefined;
    }
  }

  #prevIdx(idx){
    let arr = this.data;
    
    if(arr[idx[0]].items[idx[1]-1]){
      return [idx[0], idx[1]-1];  // previous item in the current album
    } else if (arr[idx[0]-1]) {
      return [idx[0]-1, arr[idx[0]-1].items.length - 1] // last item in the previous album
    } else {
      if(this.#loop){
        return [this.data.length-1, this.data[this.data.length-1].items.length-1] // last item of the last album
      }
      return undefined;
    }
  }

  #createSlide(idx){
    let img = Object.assign(document.createElement('img'), {
      src: `/getImage?uuid=${this.data[idx[0]].items[idx[1]].id}&width=${this.#screenWidth}&height=${this.#screenHeight}`
    });

    let div = document.createElement('div');
    div.classList = 'slide';
    div.appendChild(img);

    return div;
  }

  #next(){
    // first make DOM changes
    let activeSlide = this.shadowRoot.getElementById('slides').querySelector('[data-pos="0"]');
    activeSlide.classList.add('left');
    activeSlide.classList.remove('active');

    let nextSlide = this.shadowRoot.getElementById('slides').querySelector('[data-pos="1"]');
    nextSlide.classList.add('active');
    nextSlide.classList.remove('right');

    // now adjust data-pos values
    for(let i=-this.buffer; i<=this.buffer; i++){
      let slide = this.shadowRoot.getElementById('slides').querySelector(`[data-pos="${i}"]`);
      if(!slide){
        if(i==2){ // position of last slide will be 2 before updating to 1
          this.shadowRoot.getElementById('next').style.display = 'none';
          window.removeEventListener('keydown', this.#handleRightArrow);
        }
        break;
      }

      if(i==-this.buffer){
        slide.remove();
      } else {
        slide.dataset.pos = i-1;

        // add a slide at the end (end is now buffer - 1, due to previous statement)
        // using == here to ingore datatypes (string vs int)
        if(slide.dataset.pos == this.buffer-1){
          let nextIdx = this.#nextIdx(slide.dataset.idx.split(',').map(x=>parseInt(x)));
          
          if(nextIdx){
            let slide = this.#createSlide(nextIdx);
            slide.classList.add('right');
            slide.dataset.pos = this.buffer;
            slide.dataset.idx = nextIdx.toString();
            this.shadowRoot.getElementById('slides').append(slide);
          } else {
            // we've reached the end of slide show
          }
        }
      }
    }

  }

  #prev(){
    console.log('TBD prev')
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

  // setters and getters
  set data(_){
    // data needs to be an array of arrays. Expecting [[album items], [album items]...]
    // TODO: validate? use Array.isArray
    this.#data = _;
  }
  get data(){
    return this.#data;
  }

  set src(_){
    this.#src = _;
    fetch('/search/_')  // TODO call backend.js when ready
      .then(res=>res.json())
      .then(res=>{this.data = res})
    ;
  }
  get src(){
    return this.#src;
  }

  set startFrom(_){
    this.#startFrom = _;
  }
  get startFrom(){
    return this.#startFrom;
  }

  set buffer(_){
    this.#buffer = +_;
  }
  get buffer(){
    return this.#buffer;
  }

  set loop(_){
    this.#loop = Boolean(_)
  }
  get loop(){
    return this.#loop;
  }

}

window.customElements.define('pl-slideshow', PlSlideshow);
