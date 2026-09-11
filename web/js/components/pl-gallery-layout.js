// pl-gallery-layout: owns a scrollable region that lays out and paints one
// timeline (day-sections -> albums -> thumbs) in a single layout mode ('aspect'
// or 'square'). It is the geometry authority: all hit-testing, thumb-rect, and
// scroll-to helpers live here and read this component's own scroller.
//
// Why this exists as its own component (split out of pl-gallery):
//   - pl-gallery keeps the "chrome + orchestration" concerns: data fetch,
//     selection state, controls bar, slideshow, the gallery-index rail, nav
//     buttons, drag-select sweep coordination, and pinch-gesture detection.
//   - pl-gallery-layout keeps the "positioned, scrollable content" concern:
//     building day-sections, windowed painting, and all layout geometry.
//
// This separation makes it possible to host more than one layout at once (e.g.
// a future crossfade between 'square' and 'aspect' on pinch, where two layouts
// are stacked and dissolved) without duplicating the gallery chrome. It is also
// the seam for a future "loose" windowing design that approximates off-screen
// item positions to support very large galleries.
//
// Today pl-gallery hosts exactly ONE pl-gallery-layout and delegates to it.
// This change is a pure refactor: behavior is unchanged.
//
// Events emitted upward (composed, bubbling):
//   pl-layout-scroll     - the scroller scrolled (parent updates the index)
//   pl-layout-scrollend  - native scrollend on the scroller
// Album-level events (pl-album-*, pl-day-section-*) bubble through this
// component's shadow DOM to pl-gallery unchanged (they are composed).

import sheet from "./styles/pl-gallery-layout.css" with { type: "css" };
import './pl-gallery-index.js';
import { throttle } from '../utils.mjs';

class PlGalleryLayout extends HTMLElement {

  #data = [];                  // [{day, items: [{albumName, data:{...}, day}]}]
  #daySections = [];           // pl-day-section elements (one per day)
  #albumsInBuffer = new Map(); // album element -> 'full' | 'partial' | 'buffer-overflow'

  #mode = 'default';           // gallery mode ('default'|'search'|'trash'|'geo')
  #layoutMode = 'aspect';      // 'aspect' | 'square'
  #readOnly = false;
  #collectionId = null;
  #placeholderText = '';

  // Number of viewport-heights above and below to pre-paint thumbnails.
  // Higher = smoother normal scroll (more pre-fetched), lower = fewer
  // wasted fetches during fast scroll.
  #paintBuffer = 3;

  // Scroll-stop debounce for the gallery index (its .scrolling visibility
  // state). Cleared in disconnectedCallback.
  #indexScrollTimer = null;

  // Dedup flag for the per-frame index marker update, so multiple scroll
  // events within one frame coalesce into a single updateScroll.
  #markerRafPending = false;

  // When true, selective painting is skipped during the throttled scroll
  // handler. Set during programmatic jumps (index tick click) to avoid
  // fetching thumbnails for content that flies past during the smooth-scroll
  // animation. Cleared on scrollend.
  #isJumping = false;

  // Set during scrub (index pill drag). Prevents album painting while the
  // user drags fast. Cleared on scrub end, which triggers a final paint.
  #isScrubbing = false;

  static template = document.createElement('template');
  static {
    this.template.innerHTML = // html
    `
      <div id="scroller"></div>
      <pl-gallery-index id="gallery-index"></pl-gallery-index>
      <div id="nav-btns">
        <sl-icon-button id="prev-album-btn" name="chevron-up" label="Previous album"></sl-icon-button>
        <sl-icon-button id="next-album-btn" name="chevron-down" label="Next album"></sl-icon-button>
      </div>
    `;
  }

  constructor() {
    super().attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    // Build the shadow tree up front (scroller + index rail + nav buttons) so
    // setData can be called before connectedCallback.
    this.shadowRoot.appendChild(this.constructor.template.content.cloneNode(true));
  }

  connectedCallback() {
    let scroller = this.#scroller;
    scroller.addEventListener('scroll', this.#handleScroll);
    scroller.addEventListener('scrollend', this.#handleScrollEnd);

    // Index rail: jump-to-day, scrub-to-scroll, scrub-end.
    let indexEl = this.#index;
    indexEl.addEventListener('pl-gallery-index-jump', this.#handleIndexJump);
    indexEl.addEventListener('pl-gallery-index-scrub', this.#handleIndexScrub);
    indexEl.addEventListener('pl-gallery-index-scrub-end', this.#handleIndexScrubEnd);

    // Nav buttons: scroll to prev/next album.
    this.shadowRoot.getElementById('next-album-btn').addEventListener('click', this.#scrollToNextAlbum);
    this.shadowRoot.getElementById('prev-album-btn').addEventListener('click', this.#scrollToPrevAlbum);
  }

  disconnectedCallback() {
    let scroller = this.#scroller;
    scroller?.removeEventListener('scroll', this.#handleScroll);
    scroller?.removeEventListener('scrollend', this.#handleScrollEnd);

    let indexEl = this.#index;
    indexEl?.removeEventListener('pl-gallery-index-jump', this.#handleIndexJump);
    indexEl?.removeEventListener('pl-gallery-index-scrub', this.#handleIndexScrub);
    indexEl?.removeEventListener('pl-gallery-index-scrub-end', this.#handleIndexScrubEnd);

    this.shadowRoot.getElementById('next-album-btn')?.removeEventListener('click', this.#scrollToNextAlbum);
    this.shadowRoot.getElementById('prev-album-btn')?.removeEventListener('click', this.#scrollToPrevAlbum);

    if (this.#indexScrollTimer) {
      clearTimeout(this.#indexScrollTimer);
      this.#indexScrollTimer = null;
    }
  }

  get #scroller() {
    return this.shadowRoot.getElementById('scroller');
  }

  get #index() {
    return this.shadowRoot.getElementById('gallery-index');
  }

  // --- Build --------------------------------------------------------------

  // Build day-sections from data. Config carries the per-section props that
  // pl-gallery previously set inline. Also feeds the index its day data and
  // schedules the initial paint + index geometry push once layout settles.
  setData(data, { mode, layoutMode, readOnly, collectionId, placeholderText } = {}) {
    this.#data = data || [];
    if (mode !== undefined) this.#mode = mode || 'default';
    if (layoutMode !== undefined) this.#layoutMode = layoutMode === 'square' ? 'square' : 'aspect';
    if (readOnly !== undefined) this.#readOnly = Boolean(readOnly);
    if (collectionId !== undefined) this.#collectionId = collectionId || null;
    if (placeholderText !== undefined) this.#placeholderText = placeholderText || '';

    let scroller = this.#scroller;
    scroller.innerHTML = '';

    this.#daySections = this.#data.map(d => Object.assign(document.createElement('pl-day-section'), {
      day: d.day,
      width: scroller.clientWidth,
      layoutMode: this.#layoutMode,
      readOnly: this.#readOnly,
      collectionId: this.#collectionId,
      placeholderText: this.#placeholderText,
      items: d.items
    }));

    scroller.append(...this.#daySections);
    scroller.scrollTop = 0;

    // Hand the index its day data (jump labels).
    this.#index.data = this.#data;

    // Wait for layout to settle before measuring offsetTop and painting.
    requestAnimationFrame(() => {
      this.selectivelyPaint();
      this.#updateNavBtnState();
      this.#pushIndexLayout();
    });
  }

  // Render an empty-state message into the scroller (no results).
  renderEmpty(html) {
    this.#scroller.innerHTML = html;
    this.#daySections = [];
  }

  // --- Accessors ----------------------------------------------------------

  get daySections() { return this.#daySections; }

  // Walk all day-sections to get the flat album list.
  allAlbums() {
    return this.#daySections.flatMap(s => s.albums);
  }

  get layoutMode() { return this.#layoutMode; }

  // Scroll proxies so pl-gallery (and the index) can treat this like the old
  // #gallery scroll container.
  get scrollTop() { return this.#scroller.scrollTop; }
  set scrollTop(v) { this.#scroller.scrollTop = v; }
  get scrollHeight() { return this.#scroller.scrollHeight; }
  get clientHeight() { return this.#scroller.clientHeight; }
  get clientWidth() { return this.#scroller.clientWidth; }
  scrollTo(opts) { this.#scroller.scrollTo(opts); }

  // Toggle the sweeping class (disables native scroll during a drag-select).
  setSweeping(on) { this.classList.toggle('sweeping', !!on); }

  // --- Scroll lifecycle ---------------------------------------------------
  // Two cadences:
  //  - Per-frame (rAF-deduped): cheap update of the index marker so it tracks
  //    scroll smoothly. The index manages its own visibility state machine
  //    from updateScroll / notifyScrollStop.
  //  - Throttled (100ms): heavier work -- selective album painting and
  //    nav-button state.
  // Also emits pl-layout-scroll / pl-layout-scrollend upward for any parent
  // coordination (e.g. a future crossfade); pl-gallery does not depend on them
  // for index/paint anymore since this component self-manages both.

  #handleScroll = () => {
    if (!this.#markerRafPending) {
      this.#markerRafPending = true;
      requestAnimationFrame(() => {
        this.#markerRafPending = false;
        if (!this.isConnected) return;
        this.#index?.updateScroll(this.#scroller.scrollTop);
      });
    }
    // Reset the scroll-stop detection timer. When it fires, tell the index
    // scrolling has ceased so it can start its hide countdown.
    if (this.#indexScrollTimer) clearTimeout(this.#indexScrollTimer);
    this.#indexScrollTimer = setTimeout(() => {
      this.#indexScrollTimer = null;
      this.#index?.notifyScrollStop();
    }, 150);
    this.#throttledHeavyScroll();

    this.dispatchEvent(new CustomEvent('pl-layout-scroll', { bubbles: true, composed: true }));
  }

  #throttledHeavyScroll = throttle(() => {
    if (!this.#isJumping && !this.#isScrubbing) this.selectivelyPaint(false);
    this.#updateNavBtnState();
  }, 100);

  #handleScrollEnd = () => {
    if (this.#isJumping) {
      this.#isJumping = false;
      this.selectivelyPaint();
    }
    this.#updateNavBtnState();
    this.dispatchEvent(new CustomEvent('pl-layout-scrollend', { bubbles: true, composed: true }));
  }

  // --- Index rail ---------------------------------------------------------

  // Snapshot day-section geometry + scroll metrics and push to the index.
  // Called after layout changes (initial build, album height change, resize,
  // mode toggle).
  #pushIndexLayout() {
    let indexEl = this.#index;
    if (!indexEl) return;
    indexEl.updateLayout({
      dayOffsets: this.dayOffsets(),
      scrollHeight: this.#scroller.scrollHeight,
      clientHeight: this.#scroller.clientHeight
    });
    indexEl.updateScroll(this.#scroller.scrollTop);
  }

  #handleIndexJump = (evt) => {
    let day = evt.detail?.day;
    if (!day) return;
    this.#isJumping = true;
    this.scrollToDay(day);
  }

  #handleIndexScrub = (evt) => {
    this.#isScrubbing = true;
    this.#scroller.scrollTop = evt.detail.scrollTop;
  }

  #handleIndexScrubEnd = () => {
    this.#isScrubbing = false;
    this.selectivelyPaint();
  }

  // Called by pl-gallery after an operation changes album heights/membership
  // so the index geometry stays in sync.
  refreshIndexLayout() {
    this.#pushIndexLayout();
  }

  // --- Nav buttons --------------------------------------------------------

  #scrollToNextAlbum = () => {
    let scrollTop = this.#scroller.scrollTop;
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let albumTop = section.offsetTop + album.offsetTop;
        if (albumTop > scrollTop + 1) {
          this.#scroller.scrollTo({ top: albumTop, behavior: 'smooth' });
          return;
        }
      }
    }
  }

  #scrollToPrevAlbum = () => {
    let scrollTop = this.#scroller.scrollTop;
    let target = null;
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let albumTop = section.offsetTop + album.offsetTop;
        if (albumTop < scrollTop - 1) target = albumTop;
        else break;
      }
    }
    if (target !== null) this.#scroller.scrollTo({ top: target, behavior: 'smooth' });
  }

  #updateNavBtnState() {
    let scrollTop = this.#scroller.scrollTop;
    let maxScroll = this.#scroller.scrollHeight - this.#scroller.clientHeight;
    let firstTop = this.firstAlbumTop();
    let lastTop = this.lastAlbumTop();
    let prevBtn = this.shadowRoot.getElementById('prev-album-btn');
    let nextBtn = this.shadowRoot.getElementById('next-album-btn');
    if (prevBtn) prevBtn.disabled = scrollTop <= firstTop + 1;
    if (nextBtn) nextBtn.disabled = scrollTop >= lastTop - 1 || scrollTop >= maxScroll - 1;
  }

  // Hide/show the nav buttons (pl-gallery hides them while the slideshow is
  // open).
  setNavButtonsVisible(visible) {
    let navBtns = this.shadowRoot.getElementById('nav-btns');
    if (navBtns) navBtns.style.display = visible ? '' : 'none';
  }

  // --- Painting -----------------------------------------------------------

  selectivelyPaint(forceRepaint = true) {
    let scroller = this.#scroller;
    let scrollTop = -scroller.scrollTop;
    let viewportHeight = scroller.clientHeight;
    let bufferTop = viewportHeight * -this.#paintBuffer;
    let bufferBottom = viewportHeight * (1 + this.#paintBuffer);

    for (let section of this.#daySections) {
      let sectionTop = section.offsetTop + scrollTop;
      let sectionBottom = sectionTop + section.offsetHeight;

      let intersectsBuffer =
        (sectionBottom >= bufferTop && sectionBottom <= bufferBottom) ||
        (sectionTop >= bufferTop && sectionTop <= bufferBottom) ||
        (sectionTop <= bufferTop && sectionBottom >= bufferBottom);

      if (intersectsBuffer) {
        // Day-section partially or fully visible. Drill into albums.
        for (let album of section.albums) {
          let albumTop = section.offsetTop + album.offsetTop + scrollTop;
          let albumBottom = albumTop + album.album_height;

          let albumBottomInBuffer = albumBottom >= bufferTop && albumBottom <= bufferBottom;
          let albumTopInBuffer = albumTop >= bufferTop && albumTop <= bufferBottom;
          let albumEncompassesBuffer = albumTop <= bufferTop && albumBottom >= bufferBottom;

          // Shortcut: don't repaint if already fully loaded and unchanged
          // (only matters during scroll, not for forced repaints).
          if (
            !forceRepaint &&
            this.#albumsInBuffer.get(album) === 'full' &&
            albumBottomInBuffer && albumTopInBuffer
          ) {
            continue;
          }

          if (albumEncompassesBuffer) {
            this.#albumsInBuffer.set(album, 'buffer-overflow');
            album.selectivelyPaintLayout(bufferTop, bufferBottom, albumTop);
          } else if (albumBottomInBuffer || albumTopInBuffer) {
            album.selectivelyPaintLayout(bufferTop, bufferBottom, albumTop);
            this.#albumsInBuffer.set(album,
              (albumBottomInBuffer && albumTopInBuffer) ? 'full' : 'partial');
          } else {
            if (this.#albumsInBuffer.has(album)) {
              album.selectivelyPaintLayout(bufferTop, bufferBottom, albumTop);
              this.#albumsInBuffer.delete(album);
            }
          }
        }
      } else {
        // Day-section out of buffer entirely. Unpaint any of its albums
        // that were previously painted.
        for (let album of section.albums) {
          if (this.#albumsInBuffer.has(album)) {
            let albumTop = section.offsetTop + album.offsetTop + scrollTop;
            album.selectivelyPaintLayout(bufferTop, bufferBottom, albumTop);
            this.#albumsInBuffer.delete(album);
          }
        }
      }
    }
  }

  // Forget an album's buffer bookkeeping (used by pl-gallery when it removes
  // an emptied album).
  forgetAlbum(album) { this.#albumsInBuffer.delete(album); }

  // Remove a day-section that the caller has determined is empty.
  removeSection(section) {
    let idx = this.#daySections.indexOf(section);
    if (idx !== -1) {
      section.remove();
      this.#daySections.splice(idx, 1);
    }
  }

  // Remove all sections (empty-trash flow).
  clearSections() {
    for (let s of this.#daySections) s.remove();
    this.#daySections = [];
    this.#albumsInBuffer.clear();
  }

  // --- Resize -------------------------------------------------------------

  // Re-run layout at the current scroller width. Optionally set a new layout
  // mode first (used when a viewport resize crosses the mobile breakpoint).
  redoLayout(layoutMode) {
    if (layoutMode !== undefined) {
      let next = layoutMode === 'square' ? 'square' : 'aspect';
      if (next !== this.#layoutMode) {
        this.#layoutMode = next;
        for (let section of this.#daySections) section.layoutMode = next;
      }
    }
    let width = this.#scroller.clientWidth;
    for (let section of this.#daySections) {
      section.width = width;
      section.redoLayout();
    }
    this.selectivelyPaint();
    this.#updateNavBtnState();
    this.#pushIndexLayout();
  }

  // --- Layout mode switch (with anchor) -----------------------------------

  // Switch layout mode, keeping the item under `anchorClientY` (a viewport
  // y-coordinate) in the same on-screen position across the reflow. Repaints
  // once against the corrected scroll position. Returns true if the mode
  // actually changed.
  setLayoutMode(mode, anchorClientY) {
    mode = mode === 'square' ? 'square' : 'aspect';
    if (mode === this.#layoutMode) return false;

    let scroller = this.#scroller;
    let rect = scroller.getBoundingClientRect();

    // Find the anchor item currently under anchorClientY (fall back to the
    // scroller's vertical middle) and remember its offset from the viewport
    // top so we can restore it after the reflow.
    let anchorY = (anchorClientY == null) ? rect.top + rect.height / 2 : anchorClientY;
    let anchor = this.itemAtPoint(rect.left + rect.width / 2, anchorY) || this.#firstVisibleItem();
    let anchorOffsetInView = null;
    let anchorId = null;
    if (anchor) {
      anchorId = anchor.item.data.id;
      let rectTop = this.#itemViewportTop(anchor.section || null, anchor.album, anchor.item);
      anchorOffsetInView = rectTop - rect.top;
    }

    this.#layoutMode = mode;
    for (let section of this.#daySections) section.layoutMode = mode;

    // Correct scrollTop to restore the anchor BEFORE painting (see the long
    // explanation in the git history: painting first against the old scrollTop
    // but the new, much taller layout evicts+recreates visible thumbs, causing
    // a blur-in reload).
    if (anchorId != null && anchorOffsetInView != null) {
      let newTop = this.#itemGalleryTop(anchorId);
      if (newTop != null) {
        scroller.scrollTop = Math.max(0, newTop - anchorOffsetInView);
      }
    }

    this.selectivelyPaint();
    this.#updateNavBtnState();
    this.#pushIndexLayout();
    return true;
  }

  // --- Geometry -----------------------------------------------------------

  // Hit-test a viewport point against every item's rect. Returns
  // { section, album, item } or null. Works across album/day boundaries.
  itemAtPoint(px, py) {
    let scroller = this.#scroller;
    let rect = scroller.getBoundingClientRect();
    let scrollTop = scroller.scrollTop;

    // Quick reject: point outside the scroller viewport.
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) {
      return null;
    }

    for (let section of this.#daySections) {
      for (let album of section.albums) {
        for (let item of album.data) {
          if (!item.layout || item.layout.trX == null) continue;
          let x = rect.left + parseFloat(item.layout.trX);
          let y = rect.top + section.offsetTop + album.offsetTop +
                  item.layout.offsetHeight - scrollTop;
          let w = item.layout.width;
          let h = item.layout.height;
          if (px >= x && px <= x + w && py >= y && py <= y + h) {
            return { section, album, item };
          }
        }
      }
    }
    return null;
  }

  // Viewport-space rect of an item by id (used by the slideshow close anim).
  getThumbRect(id) {
    let scroller = this.#scroller;
    let rect = scroller.getBoundingClientRect();

    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let item = album.data.find(x => x.data.id === id);
        if (item) {
          return {
            x: rect.left + parseFloat(item.layout.trX),
            y: rect.top + section.offsetTop + album.offsetTop + item.layout.offsetHeight - scroller.scrollTop,
            w: item.layout.width,
            h: item.layout.height
          };
        }
      }
    }
    return null;
  }

  // Center an item in the viewport (slideshow item change).
  scrollToItem(id) {
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let item = album.data.find(x => x.data.id === id);
        if (item) {
          let scroller = this.#scroller;
          let targetTop = section.offsetTop + album.offsetTop + item.layout.offsetHeight;
          let centered = targetTop - (scroller.clientHeight - item.layout.height) / 2;
          scroller.scrollTo({ top: centered });
          return;
        }
      }
    }
  }

  // Smooth-scroll to a day by its key.
  scrollToDay(day) {
    let section = this.#daySections.find(s => s.day === day);
    if (!section) return;
    this.#scroller.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  }

  // Content-space top of the first and last album (nav button enable/disable).
  firstAlbumTop() {
    let albums = this.allAlbums();
    return albums.length > 0
      ? this.#daySections[0].offsetTop + albums[0].offsetTop
      : 0;
  }

  lastAlbumTop() {
    let albums = this.allAlbums();
    let lastSection = this.#daySections[this.#daySections.length - 1];
    let lastAlbum = albums[albums.length - 1];
    return (lastSection && lastAlbum)
      ? lastSection.offsetTop + lastAlbum.offsetTop
      : 0;
  }

  // Per-day geometry snapshot for the gallery index rail.
  dayOffsets() {
    return this.#daySections.map(s => ({
      day: s.day,
      offsetTop: s.offsetTop,
      offsetHeight: s.offsetHeight
    }));
  }

  // Viewport-space top of an item, using the same geometry as getThumbRect.
  #itemViewportTop(section, album, item) {
    let rect = this.#scroller.getBoundingClientRect();
    let sec = section || this.#daySections.find(s => s.albums.includes(album));
    if (!sec) return rect.top;
    return rect.top + sec.offsetTop + album.offsetTop + item.layout.offsetHeight - this.#scroller.scrollTop;
  }

  // Content-space top of an item by id (independent of scroll).
  #itemGalleryTop(id) {
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let item = album.data.find(x => x.data.id === id);
        if (item && item.layout) {
          return section.offsetTop + album.offsetTop + item.layout.offsetHeight;
        }
      }
    }
    return null;
  }

  // First painted item intersecting the top of the viewport (anchor fallback).
  #firstVisibleItem() {
    let scrollTop = this.#scroller.scrollTop;
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        for (let item of album.data) {
          if (!item.layout || item.layout.offsetHeight == null) continue;
          let top = section.offsetTop + album.offsetTop + item.layout.offsetHeight;
          if (top + item.layout.height >= scrollTop) {
            return { section, album, item };
          }
        }
      }
    }
    return null;
  }

}

window.customElements.define('pl-gallery-layout', PlGalleryLayout);
