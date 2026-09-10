// many web component practices adapted from: https://dev.to/dannyengelman/web-component-102-the-5-lessons-after-learning-web-components-101-h9p

// some functional (logic) concepts adapted from https://github.com/schlosser/pig.js/ and further expanded for multiple albums and a timeline view

// e.g. TBD
// <pl-gallery ></pl-gallery>

// Timeline-view design:
//
// 1. Server returns [{day: 'YYYY-MM-DD', items: [...]}], items already
//    ordered by datetime DESC within day, with no-time items clustered at
//    the end (by album + filename).
// 2. Gallery creates one pl-day-section per day. Each day-section internally
//    creates pl-album children by walking its items and grouping consecutive
//    same-album entries (or all same-album entries in 'folder' mode).
// 3. Selection state is tracked at the gallery level (across all days/albums).
//    Gallery owns the controls bar, move/delete orchestration, and slideshow.
// 4. Per-album event listeners are attached every time the day-section
//    rebuilds its album children (mode toggle changes the list).
// 5. Slideshow continues to receive a flat [{album, items[]}] shape; we
//    flatten the day-sections' albums when opening it.

import { throttle, notify, showConfirmDialog, showProgress, hideProgress } from '../utils.mjs';
import { searchItems, getTrashedItems, searchByGpsCoordinates, getAllItems } from '../api/search-api.mjs';
import { updateRating, trashItems, togglePrivate, restoreFromTrash, cleanupTrash, emptyTrash, moveItems } from '../api/media-api.mjs';
import { updateAlbumName } from '../api/albums-api.mjs';

import './pl-gallery-index.js';

import sheet from "./styles/pl-gallery.css" with { type: "css" };

class PlGallery extends HTMLElement {

  // internal state
  #data = [];                  // [{day, items: [{album, data:{...}, day}]}]
  #daySections = [];           // pl-day-section elements (one per day)
  #albumsInBuffer = new Map(); // album element -> 'full' | 'partial' | 'buffer-overflow'
  #albumsSelectedCnt = {};     // album_name -> count
  #itemsSelected = [];         // selected items across all albums
  // Parallel set of selected item ids, kept in sync with #itemsSelected. Used
  // only for O(1) duplicate detection so the per-event bookkeeping stays O(k)
  // in the number of newly (de)selected items rather than O(n) in the whole
  // selection -- which matters for large drag-select sweeps that fire one
  // selection event per item. #itemsSelected remains the source of truth for
  // every other read (map/every/filter/length), so those are unchanged.
  //
  // TODO: this Set is redundant with the ids already in #itemsSelected -- it
  // exists purely as an O(1) lookup index and must be kept in sync at every
  // mutation point (add/remove/reset), which is a maintenance hazard. The
  // cleaner end state is to make the selection itself a Map<id, item> (source
  // of truth, O(1) lookup + add/remove, nothing to keep in sync) and update
  // the ~22 array-style reads of #itemsSelected accordingly. Deferred to keep
  // this change minimal; do the Map conversion later.
  #selectedIds = new Set();

  // public properties
  #mode = 'default';
  #query = {};
  #slideshowItemId = null;
  #placeholderText = '';

  // Scroll-stop debounce for the gallery index (.scrolling class on the
  // index toggles its visibility). Cleared in disconnectedCallback.
  #indexScrollTimer = null;

  // Dedup flag for the per-frame marker update. Set when an rAF is pending
  // so multiple scroll events within the same frame coalesce into one
  // update.
  #markerRafPending = false;

  // When true, #selectivelyPaintAlbums is skipped during the throttled
  // scroll handler. Set during programmatic jumps (tick click, scrub) to
  // avoid fetching thumbnails for content that flies past during the
  // animation. Cleared on scrollend.
  #isJumping = false;

  // Set during scrub (pill drag). Prevents album painting while the user
  // is dragging fast. Cleared on scrub end, which triggers a final paint.
  #isScrubbing = false;

  // Drag-select sweep state. Armed by a pl-thumb long-press. The sweep selects
  // the range of items between the anchor and the item currently under the
  // pointer, in gallery/timeline order (reading order across albums and days),
  // recomputed live so overshoot-then-pullback reverts correctly.
  //   #sweepOrder    - flat [{ album, item, id }] in gallery order (built at arm)
  //   #sweepIndexById- id -> index into #sweepOrder
  //   #sweepAnchorIdx- index of the long-pressed anchor item
  //   #sweepApply    - selection state to paint across the range (anchor state)
  //   #sweepBaseline - id -> pre-sweep selected state, to restore on shrink
  //   #sweepRange    - currently applied [lo, hi] (inclusive) or null
  #isSweeping = false;
  #sweepOrder = null;
  #sweepIndexById = null;
  #sweepAnchorIdx = -1;
  #sweepApply = false;
  #sweepBaseline = null;
  #sweepRange = null;

  // Edge auto-scroll during a sweep. When the pointer sits near the top/bottom
  // of the gallery viewport we scroll on an rAF loop (independent of
  // pointermove, which stops firing when the finger is still) and re-run the
  // range computation against the last known pointer position each tick, so
  // the selection keeps extending as content slides under the finger.
  //   #sweepLastX/Y   - last pointer viewport coords (updated on pointermove)
  //   #autoScrollRaf  - pending rAF id, or null when the loop is stopped
  //   #autoScrollVel  - signed px/frame (negative = up, positive = down, 0 = off)
  #sweepLastX = 0;
  #sweepLastY = 0;
  #autoScrollRaf = null;
  #autoScrollVel = 0;

  // Number of viewport-heights above and below to pre-paint thumbnails.
  // Higher = smoother normal scroll (more pre-fetched), lower = fewer
  // wasted fetches during fast scroll.
  #paintBuffer = 3;

  // --- Mobile square-grid layout + pinch-to-zoom -------------------------
  // On mobile viewports (<= MOBILE_MAX_WIDTH) the gallery defaults to a
  // uniform square grid and a two-finger pinch toggles between 'square' and
  // 'aspect' (the justified layout). Above that width the feature is disabled
  // entirely: mode is forced to 'aspect' and the gesture is ignored.
  //   #layoutMode      - 'square' | 'aspect' (effective mode currently applied)
  //   #pinchState      - transient two-finger gesture bookkeeping, or null
  // NOTE: this is a viewport-width feature toggle (window.innerWidth), distinct
  // from pl-album's LAYOUT_WIDTH_* density breakpoints (which key off the
  // album's rendered width). They happen to share the value 640 but mean
  // different things.
  // NOTE: 640 is the only viewport breakpoint we currently need in JS. All the
  // other responsive breakpoints (e.g. the 1280px sidebar-overlay switch) live
  // in CSS @media queries. If/when JS needs another one, add a new named
  // constant here rather than reusing this one.
  static MOBILE_MAX_WIDTH = 640;
  static LAYOUT_MODE_KEY = 'pl-gallery-layout-mode';
  #layoutMode = 'aspect';
  #pinchState = null;

  static template = document.createElement('template');
  static {
    this.template.innerHTML = // html
    `
      <div id="trash-bar" style="display:none">
        <span id="trash-info"></span>
        <sl-button id="empty-trash-btn" variant="danger" size="small">
          <sl-icon slot="prefix" name="x-circle-fill"></sl-icon>
          Empty Trash
        </sl-button>
      </div>
      <div id="gallery"></div>
      <pl-gallery-index id="gallery-index"></pl-gallery-index>
      <div id="nav-btns">
        <sl-icon-button id="prev-album-btn" name="chevron-up" label="Previous album"></sl-icon-button>
        <sl-icon-button id="next-album-btn" name="chevron-down" label="Next album"></sl-icon-button>
      </div>
    `;
  }

  constructor() {
    super().attachShadow({mode: 'open'});
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  async connectedCallback() {
    this.shadowRoot.appendChild(this.constructor.template.content.cloneNode(true));

    const data = await this.#fetchData();
    if (!data) return;
    if (!this.isConnected) return;

    this.#data = this.#decorateItemsWithDay(data);
    this.#renderGallery();
  }

  // Tag each item with its day key so move/add operations can locate the
  // right day-section without re-deriving from the server's payload. With
  // the phase-3 model, day === albumDate, so we mirror that field.
  #decorateItemsWithDay(data) {
    for (let dayGroup of data) {
      for (let item of dayGroup.items) {
        item.day = dayGroup.day;
        // Server already sends albumDate per item, but be defensive in case
        // a row had a NULL album_date (e.g. before the SQL migration).
        if (!item.albumDate) item.albumDate = dayGroup.day;
      }
    }
    return data;
  }

  async #fetchData() {
    showProgress();
    try {
      const { collectionId = 1, searchText, bounds } = this.#query;
      switch (this.#mode) {
        case 'search':  return await searchItems(collectionId, searchText);
        case 'trash':   return await getTrashedItems(collectionId);
        case 'geo':     return await searchByGpsCoordinates(collectionId, bounds);
        default:        return await getAllItems(collectionId);
      }
    } catch (err) {
      notify(`<strong>Error</strong>:</br>${err.error?.message || err}`, 'error', -1);
      return null;
    } finally {
      hideProgress();
    }
  }

  #renderGallery() {
    if (this.#data.length === 0) {
      this.shadowRoot.getElementById('gallery').innerHTML =
        '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No results found</div>';
      return;
    }

    const totalItems = this.#data.reduce((sum, d) => sum + d.items.length, 0);
    const albumSet = new Set(this.#data.flatMap(d => d.items.map(i => i.albumName)));
    const verb = this.#mode === 'search' || this.#mode === 'trash' ? 'Found' : 'Showing';
    notify(`${verb} ${totalItems.toLocaleString()} items in ${albumSet.size.toLocaleString()} albums`);

    let galleryEl = this.shadowRoot.getElementById('gallery');

    // Decide the effective layout mode before building sections. On mobile
    // viewports honor the persisted choice (default 'square'); above the
    // mobile breakpoint always use 'aspect'.
    this.#layoutMode = this.#resolveInitialLayoutMode();

    this.#daySections = this.#data.map(d => {
      let section = Object.assign(document.createElement('pl-day-section'), {
        day: d.day,
        width: galleryEl.clientWidth,
        layoutMode: this.#layoutMode,
        readOnly: this.#mode === 'trash',
        collectionId: this.#query.collectionId,
        placeholderText: this.#placeholderText,
        items: d.items
      });
      return section;
    });

    galleryEl.append(...this.#daySections);

    // Attach listeners to existing album children, and re-attach when a
    // day-section rebuilds its albums (mode toggle).
    this.#attachAllAlbumListeners();
    galleryEl.addEventListener('pl-day-section-albums-changed', this.#handleSectionAlbumsChanged);
    galleryEl.addEventListener('pl-album-rename-requested', this.#handleAlbumRenameRequested);

    // Hand the index its data and listen for jump-to-day clicks and scrub.
    let indexEl = this.shadowRoot.getElementById('gallery-index');
    indexEl.data = this.#data;
    indexEl.addEventListener('pl-gallery-index-jump', this.#handleIndexJump);
    indexEl.addEventListener('pl-gallery-index-scrub', this.#handleIndexScrub);
    indexEl.addEventListener('pl-gallery-index-scrub-end', this.#handleIndexScrubEnd);

    // Reset scroll
    galleryEl.scrollTop = 0;

    // Wait for next frame so flex/flow layout settles before measuring
    // offsetTop and painting thumbs.
    requestAnimationFrame(() => {
      this.#selectivelyPaintAlbums();
      this.#updateNavBtnState();
      this.#pushIndexLayout();
    });

    if (this.#mode === 'trash') {
      let trashBar = this.shadowRoot.getElementById('trash-bar');
      trashBar.style.display = '';
      this.#updateTrashCount();
      this.shadowRoot.getElementById('empty-trash-btn').addEventListener('click', this.#handleEmptyTrash);
    }

    // Slideshow plumbing - same design as before, just flattened source data.
    this.addEventListener('pl-gallery-item-clicked', (evt) => {
      evt.stopPropagation();
      this.openSlideshow(evt.detail.id);
    });

    this.addEventListener('pl-slideshow-item-changed', (evt) => {
      evt.stopPropagation();
      this.#scrollToItem(evt.detail.currentItemId);
      this.dispatchEvent(new CustomEvent('pl-gallery-slideshow-changed', {
        composed: true, bubbles: true,
        detail: { currentItemId: evt.detail.currentItemId }
      }));
    });

    this.addEventListener('pl-slideshow-closed', (evt) => {
      evt.stopPropagation();
      this.closeSlideshow(evt.detail.currentItemId);
    });

    galleryEl.addEventListener('scroll', this.#handleScroll);
    galleryEl.addEventListener('scrollend', this.#handleScrollEnd);
    // Drag-select: a long-press on a thumb arms a sweep. The sweep itself is
    // coordinated here (not per-thumb) because on touch the pointer events
    // stay targeted at the thumb where the press began, so following the
    // finger across thumbs requires gallery-level hit-testing.
    this.addEventListener('pl-thumb-longpress-armed', this.#handleLongPressArmed);
    // Two-finger pinch to toggle square/aspect layout (mobile only). Registered
    // on the gallery element (the scroll container). touchmove is non-passive
    // because a pinch must preventDefault to stop the browser's page zoom.
    galleryEl.addEventListener('touchstart', this.#handlePinchStart, { passive: false });
    galleryEl.addEventListener('touchmove', this.#handlePinchMove, { passive: false });
    galleryEl.addEventListener('touchend', this.#handlePinchEnd);
    galleryEl.addEventListener('touchcancel', this.#handlePinchEnd);
    this.shadowRoot.getElementById('next-album-btn').addEventListener('click', this.#scrollToNextAlbum);
    this.shadowRoot.getElementById('prev-album-btn').addEventListener('click', this.#scrollToPrevAlbum);
    window.addEventListener('resize', this.#throttleHandleResize);

    if (this.#slideshowItemId) {
      requestAnimationFrame(() => this.openSlideshow(this.#slideshowItemId));
    }
  }

  // Walk all day-sections to get the flat album list. Used for selective
  // painting and any cross-album operation.
  #allAlbums() {
    return this.#daySections.flatMap(s => s.albums);
  }

  #attachAllAlbumListeners() {
    for (let album of this.#allAlbums()) this.#attachAlbumListeners(album);
  }

  #attachAlbumListeners(album) {
    if (album.dataset.listenersAttached) return;
    album.dataset.listenersAttached = '1';
    album.addEventListener('pl-album-height-changed', this.#handleAlbumHeightChange);
    album.addEventListener('pl-album-empty', this.#removeAlbum);
    album.addEventListener('pl-album-item-selected', this.#handleItemsSelected);
  }

  #handleSectionAlbumsChanged = () => {
    // Day-section toggled mode and rebuilt its albums. Selection state from
    // before is no longer valid (item element references are stale); clear
    // selection and re-attach listeners.
    if (this.#itemsSelected.length > 0) {
      this.#removeGalleryControls();
    }
    this.#attachAllAlbumListeners();
    requestAnimationFrame(() => {
      this.#selectivelyPaintAlbums();
      this.#updateNavBtnState();
      this.#pushIndexLayout();
    });
  }

  // Snapshot each day-section's geometry and push it (plus gallery scroll
  // metrics) to the index. Called after layout changes (initial render,
  // album height change, resize, day-section mode toggle). Cheap enough to
  // run on every layout event.
  #pushIndexLayout = () => {
    let indexEl = this.shadowRoot.getElementById('gallery-index');
    if (!indexEl) return;
    let galleryEl = this.shadowRoot.getElementById('gallery');
    if (!galleryEl) return;

    let dayOffsets = this.#daySections.map(s => ({
      day: s.day,
      offsetTop: s.offsetTop,
      offsetHeight: s.offsetHeight
    }));

    indexEl.updateLayout({
      dayOffsets,
      scrollHeight: galleryEl.scrollHeight,
      clientHeight: galleryEl.clientHeight
    });
    indexEl.updateScroll(galleryEl.scrollTop);
  }

  #handleIndexJump = (evt) => {
    let day = evt.detail?.day;
    if (!day) return;
    let section = this.#daySections.find(s => s.day === day);
    if (!section) return;
    let galleryEl = this.shadowRoot.getElementById('gallery');
    this.#isJumping = true;
    galleryEl.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  }

  #handleIndexScrub = (evt) => {
    let galleryEl = this.shadowRoot.getElementById('gallery');
    if (!galleryEl) return;
    this.#isScrubbing = true;
    galleryEl.scrollTop = evt.detail.scrollTop;
  }

  #handleIndexScrubEnd = () => {
    this.#isScrubbing = false;
    this.#selectivelyPaintAlbums();
  }

  #handleItemsSelected = (evt) => {
    let { selectAlbum, selected, selectedItems } = evt.detail;

    if (selected) {
      this.#albumsSelectedCnt[selectAlbum] = (this.#albumsSelectedCnt[selectAlbum] || 0) + selectedItems.length;

      // Detect duplicates against the id set (O(k), not an O(n) rescan of the
      // whole selection). Add non-duplicates to both the array and the set.
      let dups = [];
      for (let item of selectedItems) {
        if (this.#selectedIds.has(item.data.id)) {
          dups.push(item.data.id);
        } else {
          this.#selectedIds.add(item.data.id);
          this.#itemsSelected.push(item);
        }
      }
      if (dups.length > 0) {
        let dupShort = dups.map(id => id.slice(0, 8)).join(', ');
        let addedShort = selectedItems.map(i => i.data.id.slice(0, 8)).join(', ');
        notify(
          `<strong>Bug: duplicate in selection</strong><br>` +
          `Dups: ${dupShort}<br>` +
          `Album: ${selectAlbum}<br>` +
          `Just added: ${addedShort}<br>` +
          `Total selected: ${this.#itemsSelected.length}`,
          'warning', -1
        );
      }
    } else {
      this.#albumsSelectedCnt[selectAlbum] -= selectedItems.length;
      let removeIds = new Set(selectedItems.map(b => b.data.id));
      this.#itemsSelected = this.#itemsSelected.filter(a => !removeIds.has(a.data.id));
      for (let id of removeIds) this.#selectedIds.delete(id);
    }

    if (this.#itemsSelected.length > 0) {
      if (!this.shadowRoot.querySelector('pl-gallery-controls')) {
        let c = document.createElement('pl-gallery-controls');
        c.mode = this.#mode;
        c.collectionId = this.#query.collectionId;
        c.placeholderText = this.#placeholderText;
        this.shadowRoot.append(c);

        c.addEventListener('pl-gallery-controls-closed', this.#handleGalleryControlsClosed);
        c.addEventListener('pl-gallery-controls-rating-changed', this.#handleGalleryControlsRatingChanged);
        c.addEventListener('pl-gallery-controls-private-toggled', this.#handleGalleryControlsPrivateToggled);
        c.addEventListener('pl-gallery-controls-delete-pressed', this.#handleGalleryControlsDeletePressed);
        c.addEventListener('pl-gallery-controls-restore-pressed', this.#handleGalleryControlsRestorePressed);
        c.addEventListener('pl-gallery-controls-cleanup-pressed', this.#handleGalleryControlsCleanupPressed);
        c.addEventListener('pl-gallery-controls-dialog-save', (evt) => {
          this.#createOrMoveSelectedItems(evt.detail.trim());
        });
      }

      let c = this.shadowRoot.querySelector('pl-gallery-controls');
      c.ctr = this.#itemsSelected.length;
      c.selectedAlbums = this.#albumsSelectedCnt;

      // Organize is single-day only; disable it when the selection spans
      // more than one day (rating/private/delete still apply).
      let distinctDays = new Set(this.#itemsSelected.map(x => x.day || x.albumDate));
      c.multiDay = distinctDays.size > 1;

      let distinctRatings = [...new Set(this.#itemsSelected.map(x => x.data.rating))];
      c.rating = distinctRatings.length === 1 ? distinctRatings[0] : 0;
      c.allPrivate = this.#itemsSelected.every(x => x.data.private);

    } else {
      this.#removeGalleryControls();
    }
  }

  // Move selected items into a target album within their day (the server
  // constructs the per-day folder path itself). Organize is restricted to a
  // single day (the controls disable it for multi-day selections), so there
  // is exactly one affected day-section.
  //
  // After the server move succeeds we relabel the affected day's raw items
  // and let the day-section rebuild its albums via groupConsecutiveByAlbum -
  // the same grouping used on initial load. This makes the client match a
  // fresh server load in every case: a mid-day selection splits the source
  // album into [before][new][after], moving all items just relabels the
  // single album, etc. No manual album insertion/positioning needed.
  #createOrMoveSelectedItems = async (descName) => {
    descName = (descName || '').trim();

    let movedItems = this.#itemsSelected.slice();
    if (movedItems.length === 0) return;

    // Safety net: organize is single-day only (enforced by the controls).
    let days = new Set(movedItems.map(i => i.day || i.albumDate));
    if (days.size > 1) {
      notify('Organize works within a single day. Deselect the extra day(s) and try again.', 'warning', -1);
      return;
    }
    let day = [...days][0];
    let uuids = [...new Set(movedItems.map(i => i.data.id))];

    let ok = await this.#moveItemsToAlbum(day, uuids, descName);
    if (!ok) return;

    let n = uuids.length;
    notify(`${n} item${n > 1 ? 's' : ''} moved`, 'success');

    // If no matching section existed to rebuild (shouldn't happen), close the
    // controls explicitly. Otherwise the rebuild's pl-day-section-albums-changed
    // clears them.
    if (!this.#daySections.find(s => s.day === day)) this.#handleGalleryControlsClosed();
  }

  // Move the given items (uuids) to (day, albumName) on the server, then
  // relabel the affected day's raw items and rebuild its albums via
  // groupConsecutiveByAlbum. Returns true on success. Shared by the organize
  // flow and the rename-as-move path. Item-scoped, so it only affects the
  // given items (e.g. one same-named cluster among several).
  #moveItemsToAlbum = async (day, uuids, albumName) => {
    albumName = (albumName || '').trim();
    let collectionId = this.#query.collectionId;

    try {
      await moveItems(collectionId, uuids, day, albumName);
    } catch (err) {
      notify(`<strong>Failed to move items</strong><br>${err?.error?.message || err?.message || 'failed'}`, 'error', -1);
      return false;
    }

    let section = this.#daySections.find(s => s.day === day);
    if (section) {
      let movedIds = new Set(uuids);
      for (let item of section.items) {
        if (movedIds.has(item.data.id)) item.albumName = albumName;
      }
      // Reassign items (fresh array) to trigger #paintAlbums, which re-groups
      // and fires pl-day-section-albums-changed. #handleSectionAlbumsChanged
      // then clears selection, re-attaches listeners, and repaints.
      section.items = section.items.slice();
    }
    return true;
  }

  // Apply an album rename requested from a pl-album-name (bubbled up). Chooses
  // between a plain folder rename and the item-move flow:
  //   - Not filtered (search) view AND the day has exactly one album ->
  //     folder rename (efficient single mv on disk). On FOLDER_EXISTS, prompt
  //     to merge into the existing album via the move flow.
  //   - Otherwise -> move flow, scoped to this cluster's items, so renaming
  //     one of several same-named clusters (e.g. one 'TBD' of two) only
  //     affects that cluster.
  #handleAlbumRenameRequested = async (evt) => {
    let { currAlbumName, newAlbumName } = evt.detail;
    newAlbumName = (newAlbumName || '').trim();

    let albumEl = evt.composedPath().find(el => el.tagName?.toLowerCase() === 'pl-album');
    if (!albumEl) return;

    let section = this.#daySections.find(s => s.albums.includes(albumEl));
    if (!section) return;
    let day = section.day;

    let clusterUuids = (albumEl.data || []).map(i => i.data.id);
    if (clusterUuids.length === 0) return;

    let singleAlbumDay = section.albums.length === 1;
    let filtered = this.#mode === 'search';

    // Move flow: multiple albums in the day, or a filtered view (visible
    // items are a subset of the folder).
    if (!singleAlbumDay || filtered) {
      let ok = await this.#moveItemsToAlbum(day, clusterUuids, newAlbumName);
      if (ok) {
        let n = clusterUuids.length;
        notify(`${n} item${n > 1 ? 's' : ''} moved to "${newAlbumName}"`, 'success');
      }
      return;
    }

    // Folder-rename flow: single album, unfiltered.
    let collectionId = this.#query.collectionId;
    try {
      await updateAlbumName(collectionId, day, currAlbumName, newAlbumName);
    } catch (err) {
      if (err?.error?.code === 'FOLDER_EXISTS') {
        let result = await showConfirmDialog(
          'Move items?',
          'An album with that name already exists on this day. Move these items into it?',
          'Yes',
          'No'
        );
        if (result === 1) {
          let ok = await this.#moveItemsToAlbum(day, clusterUuids, newAlbumName);
          if (ok) notify('Items moved', 'success');
        }
      } else {
        notify(`<strong>Failed to rename album</strong><br>${err?.error?.message || err?.message || 'failed'}`, 'error', -1);
      }
      return;
    }

    // Rename succeeded. Single unfiltered album, so grouping is unchanged -
    // only the name differs. Avoid a full day-section rebuild/repaint: update
    // the model (section.items) in place and set the album's name property,
    // which reflects to the album-name attribute and refreshes the child label.
    let renamedIds = new Set(clusterUuids);
    for (let item of section.items) {
      if (renamedIds.has(item.data.id)) item.albumName = newAlbumName;
    }
    albumEl.albumName = newAlbumName;
    notify('Album renamed', 'success');
  }

  #handleGalleryControlsClosed = () => {
    for (let album of this.#allAlbums()) album.unselectSelectedItems();
    this.#removeGalleryControls();
  }
  
  #removeGalleryControls = () => {
    this.#itemsSelected = [];
    this.#selectedIds.clear();
    this.#albumsSelectedCnt = {};
    let c = this.shadowRoot.querySelector('pl-gallery-controls');
    if (c) c.remove();
  }

  #handleGalleryControlsRatingChanged = async (evt) => {
    try {
      await updateRating(this.#itemsSelected.map(x => x.data.id), evt.detail.newRating);
      for (let album of this.#allAlbums()) album.changeRatingSelectedItems(evt.detail.newRating);
      let n = this.#itemsSelected.length;
      notify(`Updated rating for ${n} item${n > 1 ? 's' : ''}`, 'success');
    } catch(err) {
      notify(`<strong>Error</strong>:</br>${err.error?.message || err}`, 'error', -1);
    }
  }

  #handleGalleryControlsDeletePressed = async () => {
    try {
      await trashItems(1, this.#itemsSelected.map(x => x.data.id));
      for (let album of this.#allAlbums()) album.deleteSelectedItems();
      let n = this.#itemsSelected.length;
      this.#removeGalleryControls();
      notify(`${n} item${n > 1 ? 's' : ''} moved to trash`, 'success');
    } catch(err) {
      notify(`<strong>Error</strong>:</br>${err.error?.message || err}`, 'error', -1);
    }
  }

  #handleGalleryControlsPrivateToggled = async (evt) => {
    let { makePrivate } = evt.detail;
    try {
      await togglePrivate(1, this.#itemsSelected.map(x => x.data.id), makePrivate);
      let n = this.#itemsSelected.length;
      for (let album of this.#allAlbums()) album.deleteSelectedItems();
      this.#removeGalleryControls();
      notify(`${n} item${n > 1 ? 's' : ''} ${makePrivate ? 'marked private' : 'unmarked private'}`, 'success');
    } catch(err) {
      notify(`<strong>Error</strong>:</br>${err.error?.message || err}`, 'error', -1);
    }
  }

  #handleGalleryControlsRestorePressed = async () => {
    try {
      await restoreFromTrash(1, this.#itemsSelected.map(x => x.data.id));
      let n = this.#itemsSelected.length;
      for (let album of this.#allAlbums()) album.deleteSelectedItems();
      this.#removeGalleryControls();
      notify(`${n} item${n > 1 ? 's' : ''} restored from trash`, 'success');
      if (this.#mode === 'trash') this.#updateTrashCount();
    } catch(err) {
      notify(`<strong>Error</strong>:</br>${err.error?.message || err}`, 'error', -1);
    }
  }

  #handleGalleryControlsCleanupPressed = async () => {
    try {
      await cleanupTrash(1, this.#itemsSelected.map(x => x.data.id));
      let n = this.#itemsSelected.length;
      for (let album of this.#allAlbums()) album.deleteSelectedItems();
      this.#removeGalleryControls();
      notify(`${n} item${n > 1 ? 's' : ''} permanently deleted`, 'success');
      if (this.#mode === 'trash') this.#updateTrashCount();
    } catch(err) {
      notify(`<strong>Error</strong>:</br>${err.error?.message || err}`, 'error', -1);
    }
  }

  #handleEmptyTrash = async () => {
    let result = await showConfirmDialog(
      'Empty Trash',
      'This will permanently delete all items in trash. This cannot be undone.',
      'Empty Trash',
      'Cancel'
    );
    if (result !== 1) return;

    try {
      let allUuids = this.#data.flatMap(d => d.items.map(i => i.data.id));
      await emptyTrash(1, allUuids);
      // remove all day sections
      for (let s of this.#daySections) s.remove();
      this.#daySections = [];
      this.#albumsInBuffer.clear();
      this.#updateTrashCount();
      this.#pushIndexLayout();
      notify('Trash emptied', 'success');
    } catch(err) {
      notify(`<strong>Error</strong>:</br>${err.error?.message || err}`, 'error', -1);
    }
  }

  #updateTrashCount = () => {
    let totalItems = this.#allAlbums().reduce((sum, a) => sum + a.data.length, 0);
    this.shadowRoot.getElementById('trash-info').textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''} in trash`;
    this.shadowRoot.getElementById('empty-trash-btn').disabled = totalItems === 0;
  }

  #handleAlbumHeightChange = () => {
    // With normal flow (flex column) for day-sections + albums, the browser
    // recomputes layout after a child height change. We just need to repaint
    // visible thumbs.
    this.#selectivelyPaintAlbums();
    this.#pushIndexLayout();
    setTimeout(() => {
      this.#selectivelyPaintAlbums();
      this.#pushIndexLayout();
    }, 300);
  }

  #removeAlbum = (evt) => {
    let albumEl = evt.composedPath().find(el => el.tagName?.toLowerCase() === 'pl-album');
    if (!albumEl) return;

    // Find which day-section owns this album and remove it from there
    for (let section of this.#daySections) {
      let idx = section.albums.indexOf(albumEl);
      if (idx !== -1) {
        albumEl.remove();
        section.albums.splice(idx, 1);
        this.#albumsInBuffer.delete(albumEl);

        // If the day-section is now empty, remove it too
        if (section.albums.length === 0) {
          let sIdx = this.#daySections.indexOf(section);
          if (sIdx !== -1) {
            section.remove();
            this.#daySections.splice(sIdx, 1);
          }
        }
        break;
      }
    }

    this.#handleAlbumHeightChange();
  }

  #selectivelyPaintAlbums(forceRepaint = true) {
    let galleryEl = this.shadowRoot.getElementById('gallery');
    let scrollTop = -galleryEl.scrollTop;
    let viewportHeight = galleryEl.clientHeight;
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

  #scrollToNextAlbum = () => {
    let gallery = this.shadowRoot.getElementById('gallery');
    let scrollTop = gallery.scrollTop;
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let albumTop = section.offsetTop + album.offsetTop;
        if (albumTop > scrollTop + 1) {
          gallery.scrollTo({ top: albumTop, behavior: 'smooth' });
          return;
        }
      }
    }
  }

  #scrollToPrevAlbum = () => {
    let gallery = this.shadowRoot.getElementById('gallery');
    let scrollTop = gallery.scrollTop;
    let target = null;
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let albumTop = section.offsetTop + album.offsetTop;
        if (albumTop < scrollTop - 1) target = albumTop;
        else break;
      }
    }
    if (target !== null) gallery.scrollTo({ top: target, behavior: 'smooth' });
  }

  #updateNavBtnState = () => {
    let gallery = this.shadowRoot.getElementById('gallery');
    let scrollTop = gallery.scrollTop;
    let maxScroll = gallery.scrollHeight - gallery.clientHeight;
    let albums = this.#allAlbums();
    let firstAlbumTop = albums.length > 0
      ? this.#daySections[0].offsetTop + albums[0].offsetTop
      : 0;
    let lastSection = this.#daySections[this.#daySections.length - 1];
    let lastAlbum = albums[albums.length - 1];
    let lastAlbumTop = (lastSection && lastAlbum)
      ? lastSection.offsetTop + lastAlbum.offsetTop
      : 0;
    this.shadowRoot.getElementById('prev-album-btn').disabled =
      scrollTop <= firstAlbumTop + 1;
    this.shadowRoot.getElementById('next-album-btn').disabled =
      scrollTop >= lastAlbumTop - 1 || scrollTop >= maxScroll - 1;
  }

  // Scroll handler with two cadences:
  //  - Per-frame (rAF-deduped): cheap update of the index marker so it
  //    tracks scroll smoothly without throttle-induced step lag. The index
  //    component internally manages its visibility state machine based on
  //    updateScroll / notifyScrollStop calls.
  //  - Throttled (100ms): heavier work that doesn't need frame-rate
  //    cadence -- selective album painting and nav-button state.
  #handleScroll = () => {
    if (!this.#markerRafPending) {
      this.#markerRafPending = true;
      requestAnimationFrame(() => {
        this.#markerRafPending = false;
        if (!this.isConnected) return;
        let indexEl = this.shadowRoot.getElementById('gallery-index');
        let galleryEl = this.shadowRoot.getElementById('gallery');
        if (!indexEl || !galleryEl) return;
        indexEl.updateScroll(galleryEl.scrollTop);
      });
    }
    // Reset the scroll-stop detection timer. When it fires, it tells the
    // index that scrolling has ceased so it can start its hide countdown.
    if (this.#indexScrollTimer) clearTimeout(this.#indexScrollTimer);
    this.#indexScrollTimer = setTimeout(() => {
      this.#indexScrollTimer = null;
      let indexEl = this.shadowRoot.getElementById('gallery-index');
      if (indexEl) indexEl.notifyScrollStop();
    }, 150); // short debounce to detect "scroll stopped"
    this.#throttledHeavyScroll();
  }

  #throttledHeavyScroll = throttle(() => {
    if (!this.#isJumping && !this.#isScrubbing) this.#selectivelyPaintAlbums(false);
    this.#updateNavBtnState();
  }, 100);

  #handleScrollEnd = () => {
    if (this.#isJumping) {
      this.#isJumping = false;
      this.#selectivelyPaintAlbums();
    }
    this.#updateNavBtnState();
  }

  // --- Drag-select sweep -------------------------------------------------
  // Armed by a pl-thumb long-press. We then follow the pointer across thumbs
  // (via coordinate hit-testing against the layout geometry we already have)
  // and paint the anchor's selection state onto each newly-entered item.

  #handleLongPressArmed = (evt) => {
    let { id, anchorSelected } = evt.detail || {};
    if (id == null) return;

    // Build the flat gallery/timeline order once for this sweep, and snapshot
    // each item's pre-sweep selection so shrinking the range can restore it.
    this.#sweepOrder = [];
    this.#sweepIndexById = new Map();
    this.#sweepBaseline = new Map();
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        for (let item of album.data) {
          let idStr = String(item.data.id);
          this.#sweepIndexById.set(idStr, this.#sweepOrder.length);
          this.#sweepOrder.push({ album, item, id: idStr });
          this.#sweepBaseline.set(idStr, !!item.layout.selected);
        }
      }
    }

    this.#sweepAnchorIdx = this.#sweepIndexById.get(String(id));
    if (this.#sweepAnchorIdx == null || this.#sweepAnchorIdx < 0) {
      // Anchor not found (shouldn't happen) - abort cleanly.
      this.#sweepOrder = this.#sweepIndexById = this.#sweepBaseline = null;
      return;
    }
    // The anchor's baseline is its state BEFORE the long-press toggled it, so
    // that if the range ever collapses we don't fight the thumb's own toggle.
    // The thumb already applied anchorSelected to the anchor; treat that as the
    // paint value and keep the anchor always in-range.
    this.#sweepApply = !!anchorSelected;
    this.#sweepBaseline.set(String(id), !anchorSelected);
    this.#isSweeping = true;
    this.#sweepRange = [this.#sweepAnchorIdx, this.#sweepAnchorIdx];

    let galleryEl = this.shadowRoot.getElementById('gallery');
    if (!galleryEl) return;
    // Suppress native scroll while sweeping. The move listener is non-passive
    // (preventDefault). Scroll suppression is reliable because the long-press
    // required the finger to stay within 10px, so no scroll has begun. The
    // heavy lifting for touch is done on the thumb img (touch-action:none +
    // touchmove preventDefault); this is a secondary guard.
    galleryEl.classList.add('sweeping');
    galleryEl.addEventListener('pointermove', this.#handleSweepMove, { passive: false });
    galleryEl.addEventListener('pointerup', this.#handleSweepEnd);
    galleryEl.addEventListener('pointercancel', this.#handleSweepEnd);
  }

  #handleSweepMove = (evt) => {
    if (!this.#isSweeping) return;
    // Prevent the gallery from scrolling during the sweep.
    evt.preventDefault();

    // Cache the pointer so the auto-scroll loop can re-hit-test while the
    // finger is held still at an edge.
    this.#sweepLastX = evt.clientX;
    this.#sweepLastY = evt.clientY;

    this.#updateSweepRangeAt(evt.clientX, evt.clientY);
    this.#updateAutoScroll(evt.clientY);
  }

  // Hit-test the item at (x, y) and grow/shrink the selected range to span
  // anchor..current in timeline order. Shared by pointermove and the
  // auto-scroll tick. No-op if no item is under the point.
  #updateSweepRangeAt(x, y) {
    let hit = this.#itemAtPoint(x, y);
    if (!hit) return;

    let curIdx = this.#sweepIndexById.get(String(hit.item.data.id));
    if (curIdx == null) return;

    // Desired inclusive range between anchor and the item under the pointer,
    // in timeline order (works in both directions).
    let lo = Math.min(this.#sweepAnchorIdx, curIdx);
    let hi = Math.max(this.#sweepAnchorIdx, curIdx);

    let [prevLo, prevHi] = this.#sweepRange;
    if (lo === prevLo && hi === prevHi) return; // no change

    this.#applyRangeDiff(prevLo, prevHi, lo, hi);
    this.#sweepRange = [lo, hi];
  }

  // Decide the auto-scroll velocity from how deep the pointer is inside the
  // top/bottom edge band, and start/stop the rAF loop accordingly.
  // Effective top of the sweep-usable area: the gallery's top, pushed down
  // below the selection controls bar (fixed at the top of the viewport) when
  // present, plus the sticky day + album headers that pin at the top of the
  // scroll area and cover the top rows. This keeps the upward auto-scroll zone
  // and edge hit-testing out from behind all of those overlays.
  //
  // The header heights are fixed in CSS: the day header is 36px
  // (pl-day-section.css) and the album-name header is 36px (pl-album.css,
  // mirrored by #album_name_height). Kept as a constant here in sync with
  // those, matching how pl-album already hardcodes 36.
  #sweepStickyHeaderHeight = 72; // day header (36) + album header (36)

  #sweepTopEdge(galleryRect) {
    let topEdge = galleryRect.top;
    let controls = this.shadowRoot.querySelector('pl-gallery-controls');
    if (controls) {
      let cRect = controls.getBoundingClientRect();
      if (cRect.height > 0) topEdge = Math.max(topEdge, cRect.bottom);
    }
    // Clear the sticky day + album headers pinned below the controls bar.
    return topEdge + this.#sweepStickyHeaderHeight;
  }

  #updateAutoScroll(py) {
    let gallery = this.shadowRoot.getElementById('gallery');
    if (!gallery) return;
    let rect = gallery.getBoundingClientRect();

    // The selection controls bar (fixed at viewport top) and the sticky day +
    // album headers overlay the top of the gallery. Treat the effective top
    // edge as below all of them so the upward auto-scroll zone starts where
    // content is actually visible, not hidden behind those overlays.
    let topEdge = this.#sweepTopEdge(rect);

    // Edge band: ~12% of viewport height, at least 48px.
    let band = Math.max(48, rect.height * 0.12);
    let maxVel = 24, minVel = 4;

    let vel = 0;
    let topDist = py - topEdge;               // distance below the effective top edge
    let bottomDist = rect.bottom - py;        // distance above the bottom edge

    if (topDist < band) {
      // Deeper into the band (smaller topDist) => faster. Ramp min..max.
      let depth = Math.min(1, Math.max(0, (band - topDist) / band));
      vel = -(minVel + (maxVel - minVel) * depth);
    } else if (bottomDist < band) {
      let depth = Math.min(1, Math.max(0, (band - bottomDist) / band));
      vel = minVel + (maxVel - minVel) * depth;
    }

    this.#autoScrollVel = vel;

    if (vel !== 0) {
      this.#ensureAutoScrollLoop();
    } else if (this.#autoScrollRaf != null) {
      cancelAnimationFrame(this.#autoScrollRaf);
      this.#autoScrollRaf = null;
    }
  }

  // Schedule the loop only if one is not already pending, so pointermove and
  // the tick's self-reschedule can never create two concurrent loops.
  #ensureAutoScrollLoop() {
    if (this.#autoScrollRaf == null) {
      this.#autoScrollRaf = requestAnimationFrame(this.#autoScrollTick);
    }
  }

  #autoScrollTick = () => {
    this.#autoScrollRaf = null;
    if (!this.#isSweeping || this.#autoScrollVel === 0) return;

    let gallery = this.shadowRoot.getElementById('gallery');
    if (!gallery) return;

    let maxScroll = gallery.scrollHeight - gallery.clientHeight;
    let next = Math.min(maxScroll, Math.max(0, gallery.scrollTop + this.#autoScrollVel));
    let moved = next !== gallery.scrollTop;
    gallery.scrollTop = next;

    // After scrolling, a different item sits under the (stationary) pointer;
    // re-run the range computation so the selection extends. Clamp the y just
    // inside the viewport so a finger parked exactly at (or past) the edge
    // still hit-tests onto the edge-most item instead of failing the
    // out-of-viewport reject in #itemAtPoint. The native scroll event also
    // fires and repaints newly revealed albums.
    if (moved) {
      let rect = gallery.getBoundingClientRect();
      // Keep the re-hit-test point below the controls bar (see #sweepTopEdge)
      // so an upward auto-scroll lands on a visible thumb, not one hidden
      // behind the bar.
      let topEdge = this.#sweepTopEdge(rect);
      let clampedY = Math.min(rect.bottom - 1, Math.max(topEdge + 1, this.#sweepLastY));
      this.#updateSweepRangeAt(this.#sweepLastX, clampedY);
      // Keep looping while still in an edge zone and not clamped at an end.
      this.#ensureAutoScrollLoop();
    } else {
      // Clamped at top/bottom: stop until the pointer moves again.
      this.#autoScrollVel = 0;
    }
  }

  #stopAutoScroll() {
    if (this.#autoScrollRaf != null) {
      cancelAnimationFrame(this.#autoScrollRaf);
      this.#autoScrollRaf = null;
    }
    this.#autoScrollVel = 0;
  }

  // Apply the new inclusive range and revert items that dropped out of the old
  // range back to their pre-sweep baseline. Only touches items whose in-range
  // membership actually changed, so it is cheap even for large sweeps.
  #applyRangeDiff(prevLo, prevHi, lo, hi) {
    // Revert items that were in the old range but not the new one.
    for (let i = prevLo; i <= prevHi; i++) {
      if (i >= lo && i <= hi) continue; // still in range
      let entry = this.#sweepOrder[i];
      let base = this.#sweepBaseline.get(entry.id);
      entry.album.setItemSelectedById(entry.item.data.id, base);
    }
    // Select items that are in the new range but were not in the old one.
    for (let i = lo; i <= hi; i++) {
      if (i >= prevLo && i <= prevHi) continue; // already applied
      let entry = this.#sweepOrder[i];
      entry.album.setItemSelectedById(entry.item.data.id, this.#sweepApply);
    }
  }

  #handleSweepEnd = () => {
    if (!this.#isSweeping) return;
    this.#isSweeping = false;
    this.#stopAutoScroll();
    this.#sweepOrder = null;
    this.#sweepIndexById = null;
    this.#sweepBaseline = null;
    this.#sweepRange = null;
    this.#sweepAnchorIdx = -1;
    let galleryEl = this.shadowRoot.getElementById('gallery');
    if (!galleryEl) return;
    galleryEl.classList.remove('sweeping');
    galleryEl.removeEventListener('pointermove', this.#handleSweepMove);
    galleryEl.removeEventListener('pointerup', this.#handleSweepEnd);
    galleryEl.removeEventListener('pointercancel', this.#handleSweepEnd);
  }

  // Hit-test a viewport point against every item's rect, inverting the same
  // geometry used by #getThumbRect. Returns { album, item } or null. Works
  // across album/day boundaries since we walk all sections.
  #itemAtPoint(px, py) {
    let gallery = this.shadowRoot.getElementById('gallery');
    let galleryRect = gallery.getBoundingClientRect();
    let scrollTop = gallery.scrollTop;

    // Quick reject: point outside the gallery viewport.
    if (px < galleryRect.left || px > galleryRect.right ||
        py < galleryRect.top || py > galleryRect.bottom) {
      return null;
    }

    for (let section of this.#daySections) {
      for (let album of section.albums) {
        for (let item of album.data) {
          if (!item.layout || item.layout.trX == null) continue;
          let x = galleryRect.left + parseFloat(item.layout.trX);
          let y = galleryRect.top + section.offsetTop + album.offsetTop +
                  item.layout.offsetHeight - scrollTop;
          let w = item.layout.width;
          let h = item.layout.height;
          if (px >= x && px <= x + w && py >= y && py <= y + h) {
            return { album, item };
          }
        }
      }
    }
    return null;
  }
  // --- end drag-select sweep ---------------------------------------------

  // --- Mobile square-grid layout + pinch-to-zoom -------------------------

  #isMobileViewport() {
    return window.innerWidth <= this.constructor.MOBILE_MAX_WIDTH;
  }

  // Effective mode at render time: above the mobile breakpoint always
  // 'aspect'; on mobile the persisted choice, defaulting to 'square'.
  #resolveInitialLayoutMode() {
    if (!this.#isMobileViewport()) return 'aspect';
    let stored = null;
    try { stored = localStorage.getItem(this.constructor.LAYOUT_MODE_KEY); } catch (e) { /* ignore */ }
    return stored === 'aspect' ? 'aspect' : 'square';
  }

  #persistLayoutMode(mode) {
    try { localStorage.setItem(this.constructor.LAYOUT_MODE_KEY, mode); } catch (e) { /* ignore */ }
  }

  // Switch the effective layout mode. Fans the mode out to every day-section
  // (and thus album), then repaints. Anchors the item under `anchorClientY`
  // (a viewport y-coordinate) so the same content stays under the user's
  // fingers across the reflow. Persists the choice.
  #setLayoutMode(mode, anchorClientY) {
    mode = mode === 'square' ? 'square' : 'aspect';
    if (mode === this.#layoutMode) return;

    let galleryEl = this.shadowRoot.getElementById('gallery');
    let galleryRect = galleryEl.getBoundingClientRect();

    // Find the anchor item currently under anchorClientY (fall back to the
    // gallery's vertical middle) and remember its offset from the viewport
    // top so we can restore it after the reflow.
    let anchorY = (anchorClientY == null) ? galleryRect.top + galleryRect.height / 2 : anchorClientY;
    let anchor = this.#itemAtPoint(galleryRect.left + galleryRect.width / 2, anchorY)
              || this.#firstVisibleItem();
    let anchorOffsetInView = null;
    let anchorId = null;
    if (anchor) {
      anchorId = anchor.item.data.id;
      let rectTop = this.#itemViewportTop(anchor.section || null, anchor.album, anchor.item);
      anchorOffsetInView = rectTop - galleryRect.top;
    }

    this.#layoutMode = mode;
    this.#persistLayoutMode(mode);
    for (let section of this.#daySections) section.layoutMode = mode;

    // Reflow settled synchronously (each album recomputed on set). Repaint the
    // visible buffer, refresh the index geometry, then restore the anchor.
    this.#selectivelyPaintAlbums();
    this.#pushIndexLayout();

    if (anchorId != null && anchorOffsetInView != null) {
      let newTop = this.#itemGalleryTop(anchorId);
      if (newTop != null) {
        galleryEl.scrollTop = Math.max(0, newTop - anchorOffsetInView);
      }
    }

    // A second repaint after the scroll adjust so newly-exposed rows paint.
    requestAnimationFrame(() => {
      this.#selectivelyPaintAlbums();
      this.#updateNavBtnState();
      this.#pushIndexLayout();
    });
  }

  // Viewport-space top of an item, using the same geometry as #getThumbRect.
  #itemViewportTop(section, album, item) {
    let gallery = this.shadowRoot.getElementById('gallery');
    let galleryRect = gallery.getBoundingClientRect();
    // section may be unknown (hit-test only returns album+item); find it.
    let sec = section || this.#daySections.find(s => s.albums.includes(album));
    if (!sec) return galleryRect.top;
    return galleryRect.top + sec.offsetTop + album.offsetTop + item.layout.offsetHeight - gallery.scrollTop;
  }

  // Gallery-content-space top of an item by id (independent of scroll).
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
    let gallery = this.shadowRoot.getElementById('gallery');
    let scrollTop = gallery.scrollTop;
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

  #pinchDistance(t0, t1) {
    let dx = t0.clientX - t1.clientX;
    let dy = t0.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }

  #handlePinchStart = (evt) => {
    if (!this.#isMobileViewport()) return;
    if (evt.touches.length !== 2) return;

    // A pinch is unambiguously not a drag-select (which is single-finger).
    // If a sweep somehow armed, end it so the two gestures never fight.
    if (this.#isSweeping) this.#handleSweepEnd();

    evt.preventDefault(); // stop native page zoom
    let [t0, t1] = evt.touches;
    this.#pinchState = {
      startDist: this.#pinchDistance(t0, t1),
      midY: (t0.clientY + t1.clientY) / 2,
      fired: false
    };
  }

  #handlePinchMove = (evt) => {
    if (!this.#pinchState) return;
    if (evt.touches.length !== 2) return;
    evt.preventDefault();

    let [t0, t1] = evt.touches;
    let dist = this.#pinchDistance(t0, t1);
    let ratio = dist / this.#pinchState.startDist;

    // One flip per gesture. Pinch-out (fingers apart) -> aspect (zoom in to
    // real sizes); pinch-in -> square grid.
    if (this.#pinchState.fired) return;
    if (ratio > 1.2) {
      this.#pinchState.fired = true;
      this.#setLayoutMode('aspect', this.#pinchState.midY);
    } else if (ratio < 0.8) {
      this.#pinchState.fired = true;
      this.#setLayoutMode('square', this.#pinchState.midY);
    }
  }

  #handlePinchEnd = (evt) => {
    // Clear only when the pinch truly ends (fewer than 2 touches remain).
    if (evt.touches && evt.touches.length >= 2) return;
    this.#pinchState = null;
  }
  // --- end mobile square-grid layout -------------------------------------

  #handleResize() {
    // Re-evaluate the effective layout mode purely on viewport width. Above
    // the mobile breakpoint force 'aspect' (feature disabled); at/below it,
    // honor the persisted choice (default 'square'). This runs before the
    // width/redoLayout pass so albums lay out in the correct mode.
    let desired = this.#resolveInitialLayoutMode();
    if (desired !== this.#layoutMode) {
      this.#layoutMode = desired;
      for (let section of this.#daySections) section.layoutMode = desired;
    }
    for (let section of this.#daySections) {
      section.width = this.shadowRoot.getElementById('gallery').clientWidth;
      section.redoLayout();
    }
    this.#selectivelyPaintAlbums();
    this.#pushIndexLayout();
  }
  #throttleHandleResize = throttle(() => this.#handleResize(), 100);

  disconnectedCallback() {
    let galleryEl = this.shadowRoot.getElementById('gallery');
    galleryEl?.removeEventListener('scroll', this.#handleScroll);
    galleryEl?.removeEventListener('scrollend', this.#handleScrollEnd);
    // Defensive: if disconnected mid-sweep, remove the transient listeners.
    galleryEl?.removeEventListener('pointermove', this.#handleSweepMove);
    galleryEl?.removeEventListener('pointerup', this.#handleSweepEnd);
    galleryEl?.removeEventListener('pointercancel', this.#handleSweepEnd);
    this.removeEventListener('pl-thumb-longpress-armed', this.#handleLongPressArmed);
    galleryEl?.removeEventListener('touchstart', this.#handlePinchStart);
    galleryEl?.removeEventListener('touchmove', this.#handlePinchMove);
    galleryEl?.removeEventListener('touchend', this.#handlePinchEnd);
    galleryEl?.removeEventListener('touchcancel', this.#handlePinchEnd);
    this.#pinchState = null;
    this.#isSweeping = false;
    this.#stopAutoScroll();
    this.#sweepOrder = null;
    this.#sweepIndexById = null;
    this.#sweepBaseline = null;
    this.#sweepRange = null;
    this.shadowRoot.getElementById('next-album-btn')?.removeEventListener('click', this.#scrollToNextAlbum);
    this.shadowRoot.getElementById('prev-album-btn')?.removeEventListener('click', this.#scrollToPrevAlbum);
    window.removeEventListener('resize', this.#throttleHandleResize);
    if (this.#indexScrollTimer) {
      clearTimeout(this.#indexScrollTimer);
      this.#indexScrollTimer = null;
    }
  }

  attributeChangedCallback() { /* unused */ }
  adoptedCallback() { /* unused */ }

  get mode() { return this.#mode; }
  set mode(_) { this.#mode = _ || 'default'; }

  get query() { return this.#query; }
  /**
   * Mode-specific parameters for data fetching.
   * @param {object} _ - Query object, shape depends on mode:
   *   mode 'default': { collectionId: number }
   *   mode 'search':  { collectionId: number, searchText: string }
   *   mode 'trash':   { collectionId: number }
   *   mode 'geo':     { collectionId: number, bounds: { sw: {lat, lng}, ne: {lat, lng} } }
   */
  set query(_) { this.#query = _ || {}; }

  get slideshowItemId() { return this.#slideshowItemId; }
  set slideshowItemId(_) { this.#slideshowItemId = _ || null; }

  get placeholderText() { return this.#placeholderText; }
  set placeholderText(_) { this.#placeholderText = _ || ''; }

  get isSlideshowOpen() {
    return !!this.shadowRoot.querySelector('pl-slideshow');
  }

  // DESIGN: openSlideshow is public so app-shell can call it for direct URL
  // visits. Slideshow data is a flat [{album, items[]}], so we flatten across
  // all day-sections and their albums.
  openSlideshow(startFromId) {
    if (this.isSlideshowOpen) return;

    let slideshowData = [];
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        slideshowData.push({ album: album.albumName, items: album.data });
      }
    }

    let slideshow = Object.assign(document.createElement('pl-slideshow'), {
      data: slideshowData,
      startFrom: startFromId,
      buffer: 1,
      mode: this.#mode
    });

    this.shadowRoot.getElementById('nav-btns').style.display = 'none';
    this.shadowRoot.appendChild(slideshow);

    this.dispatchEvent(new CustomEvent('pl-gallery-slideshow-opened', {
      composed: true, bubbles: true,
      detail: { currentItemId: startFromId }
    }));
  }

  closeSlideshow(currentItemId) {
    let slideshow = this.shadowRoot.querySelector('pl-slideshow');
    if (!slideshow) return;

    if (!currentItemId) {
      let active = slideshow.shadowRoot?.querySelector('#slides [data-pos="0"]');
      if (active) {
        let idx = active.dataset.idx.split(',').map(Number);
        currentItemId = slideshow.data[idx[0]]?.items[idx[1]]?.data?.id;
      }
    }

    this.shadowRoot.getElementById('nav-btns').style.display = '';

    let thumbRect = currentItemId ? this.#getThumbRect(currentItemId) : null;
    let mediaRect = slideshow.prepareForDismiss();

    if (!thumbRect || !mediaRect) {
      slideshow.remove();
      this.dispatchEvent(new Event('pl-gallery-slideshow-closed', { composed: true, bubbles: true }));
      return;
    }

    let mediaCenterX = mediaRect.left + mediaRect.width / 2;
    let mediaCenterY = mediaRect.top + mediaRect.height / 2;
    let thumbCenterX = thumbRect.x + thumbRect.w / 2;
    let thumbCenterY = thumbRect.y + thumbRect.h / 2;
    let scale = thumbRect.w / mediaRect.width;
    let tx = thumbCenterX - mediaCenterX;
    let ty = thumbCenterY - mediaCenterY;

    slideshow.style.transformOrigin = `${mediaCenterX}px ${mediaCenterY}px`;

    let anim = slideshow.animate([
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${tx}px, ${ty}px) scale(${scale})` }
    ], {
      duration: 200,
      easing: 'ease-in',
      fill: 'forwards'
    });

    anim.finished.then(() => {
      slideshow.remove();
      this.dispatchEvent(new Event('pl-gallery-slideshow-closed', { composed: true, bubbles: true }));
    });
  }

  #getThumbRect(id) {
    let gallery = this.shadowRoot.getElementById('gallery');
    let galleryRect = gallery.getBoundingClientRect();

    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let item = album.data.find(x => x.data.id === id);
        if (item) {
          return {
            x: galleryRect.left + parseFloat(item.layout.trX),
            y: galleryRect.top + section.offsetTop + album.offsetTop + item.layout.offsetHeight - gallery.scrollTop,
            w: item.layout.width,
            h: item.layout.height
          };
        }
      }
    }
    return null;
  }

  #scrollToItem(id) {
    for (let section of this.#daySections) {
      for (let album of section.albums) {
        let item = album.data.find(x => x.data.id === id);
        if (item) {
          let gallery = this.shadowRoot.getElementById('gallery');
          let targetTop = section.offsetTop + album.offsetTop + item.layout.offsetHeight;
          let centered = targetTop - (gallery.clientHeight - item.layout.height) / 2;
          gallery.scrollTo({ top: centered });
          return;
        }
      }
    }
  }

}

window.customElements.define('pl-gallery', PlGallery);
