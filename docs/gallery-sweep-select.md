# Gallery Selection: Long-Press and Drag-Select (Sweep)

This document describes the touch/pointer selection gestures in the timeline
gallery: the enlarged per-item toggle, long-press to select, and drag-select
("sweep") of a range of items.

It is the reference for the selection code spread across `web/js/components/`:
`pl-thumb.js` (per-item gesture), `pl-album.js` (per-album selection state),
`pl-gallery.js` (sweep orchestration), and the styles in
`web/js/components/styles/pl-thumb.css` and `pl-gallery.css`.

## Goals

The gallery needed a faster way to select many items on touch devices. Before
this work the only way to select was tapping a small (21px) circle checkbox in
each thumb's corner -- precise and slow on a phone. The design adds:

1. A larger, easier-to-hit per-item toggle.
2. Long-press anywhere on a thumb to toggle its selection.
3. Drag-select: after a long-press, drag across thumbs to select a whole range,
   in timeline order, without lifting the finger.

A hard constraint throughout: a normal tap on a thumb must always open the
slideshow, even mid-selection. Selection never hijacks the tap.

## 1. Enlarged toggle target

`pl-thumb.css`: the selection checkbox is a hidden `<input type=checkbox>` with
a `<label>` whose `:before` draws the circle glyph. The label is given an
explicit 44x44px transparent hit area anchored top-left (the standard minimum
touch target), while the visual circle is 24px. Tapping anywhere in the 44px box
toggles the checkbox via native `<label for>` forwarding -- no JS change was
needed for this part. This applies to all viewports, not just touch.

## 2. Long-press to select

`pl-thumb.js` attaches pointer listeners to the thumb `<img>`:

- `pointerdown` records the start coordinate and starts a 500ms timer.
- `pointermove` cancels the timer if the pointer moves more than 10px (i.e. the
  user is scrolling/dragging, not holding).
- When the timer completes, the thumb toggles its own checkbox and dispatches
  the same `r3-item-selected` event a checkbox click would, so `pl-album` and
  `pl-gallery` see an identical selection path.

A completed long-press sets `#suppressNextClick` so the `click` the browser
fires on `pointerup` does not also open the slideshow. That flag is reset on the
next `pointerdown` so a stale flag can never swallow a later tap.

The native context menu / image "save" popup is suppressed on the thumb
(`contextmenu` preventDefault), and native image drag-and-drop is disabled
(`img.draggable = false` + `dragstart` preventDefault) so a mouse press-drag
does not start an image drag.

Long-press works for all pointer types (mouse, touch, pen).

## 3. Drag-select (sweep)

A completed long-press also *arms* a sweep. The thumb dispatches
`pl-thumb-longpress-armed` (composed, bubbles) with `{ id, anchorSelected }`.
`pl-gallery` listens for this and coordinates the sweep.

### Why the sweep is coordinated at the gallery, not the thumb

On touch, the element that receives `pointerdown` gets *implicit pointer
capture* -- all subsequent pointer events stay targeted at the anchor thumb's
img, even as the finger moves over other thumbs. So the anchor thumb cannot know
which thumb the finger is now over. The events do still *bubble* (composed) up to
the gallery, and `event.clientX/clientY` always report the true pointer
position. The gallery therefore does the cross-thumb hit-testing.

### Hit-testing without piercing shadow DOM

Each thumb lives in its own shadow root, nested in `pl-album` and
`pl-day-section` shadow roots, and thumbs are created/destroyed as they scroll
in and out of view. Rather than use `elementFromPoint` (which would need to
pierce several shadow boundaries and only sees painted elements), the gallery
inverts the layout geometry it already stores. `#itemAtPoint(px, py)` walks all
day-sections/albums/items and computes each item's viewport rect from
`section.offsetTop + album.offsetTop + item.layout.offsetHeight - scrollTop`
(the same formula `#getThumbRect` uses for the slideshow close animation),
returning the item whose rect contains the point. This works for items that are
not currently painted, because `item.layout` exists regardless of paint state.

### Range selection in timeline order

The sweep selects the *range* of items between the anchor and the item under the
pointer, in gallery/timeline order (reading order: left-to-right, top-to-bottom,
across album and day boundaries). This is the Google-Photos model: dragging
straight down from the anchor selects every item in between, including items to
the right on intermediate rows -- so selecting a large contiguous block does not
require zig-zagging the finger across every thumb.

Implementation (`pl-gallery.js`), on arm:

- Build `#sweepOrder`: a flat `[{ album, item, id }]` in gallery order.
- Build `#sweepIndexById`: id -> index into that list.
- Record `#sweepAnchorIdx`: the anchor's index.
- Snapshot `#sweepBaseline`: id -> each item's pre-sweep selected state.
- `#sweepApply`: the state to paint across the range (the anchor's resulting
  state -- select if the long-press selected, deselect if it deselected).
- `#sweepRange`: the currently applied inclusive `[lo, hi]`, starting at
  `[anchorIdx, anchorIdx]`.

On each `pointermove`:

- Hit-test the item under the pointer, get its index `curIdx`.
- Desired range is `[min(anchorIdx, curIdx), max(anchorIdx, curIdx)]` -- so it
  works dragging in either direction.
- `#applyRangeDiff` compares the new range to the previous one and only touches
  items whose membership changed: newly in-range items get `#sweepApply`; items
  that dropped out are reverted to their `#sweepBaseline` value. This makes
  overshoot-then-pull-back behave correctly and keeps prior (pre-sweep)
  selections intact.

Applying a single item's selection goes through `pl-album.setItemSelectedById`,
which is idempotent (no-op if already in the target state), syncs
`item.layout.selected` and the live thumb element, updates the album-level
select indicator, and dispatches the same `pl-album-item-selected` event as a
checkbox click. So the gallery's selection accounting and controls bar stay in
sync through the exact same path as every other selection method.

On `pointerup`/`pointercancel` (and defensively on `disconnectedCallback`), the
sweep state is cleared and the transient listeners removed.

### Suppressing scroll during a touch sweep

The subtle part. On touch, Chrome decides scroll-vs-not at gesture start and
*ignores* `preventDefault()` on `pointermove` for scrolling (it will still fire
`pointercancel` and abort the gesture). The reliable levers are:

- `touch-action: none` on the element that holds the pointer capture -- i.e. the
  anchor thumb's `img`, not an ancestor. Set at arm time. This takes effect for
  the in-progress gesture *because* the long-press required the finger to stay
  within 10px for 500ms, so no scroll has begun yet.
- A non-passive `touchmove` listener on the img that calls `preventDefault()`
  while sweeping. Unlike `pointermove`, Chrome honors `preventDefault` on
  `touchmove` to stop scroll. Guarded by `evt.cancelable` to avoid the
  "scroll in progress" console warning.

Both are set on arm and reset on end. The anchor img also takes
`setPointerCapture(pointerId)`. `pl-gallery.css` additionally sets
`#gallery.sweeping { touch-action: none }` as a secondary ancestor guard; the
img-level suppression is what actually does the work.

This combination was arrived at after `pointermove`-preventDefault and
ancestor-only `touch-action` both failed with a `pointercancel` mid-drag on
touch.

### Edge auto-scroll

When the pointer nears the top or bottom of the gallery viewport mid-sweep, the
gallery auto-scrolls in that direction so the selection can extend past the
visible area (Google-Photos style), without lifting the finger.

Because a finger held still at the edge fires no `pointermove`, auto-scroll runs
on its own `requestAnimationFrame` loop rather than being event-driven:

- `#handleSweepMove` caches the last pointer position (`#sweepLastX/Y`) and calls
  `#updateAutoScroll(py)`.
- `#updateAutoScroll` measures how deep the pointer is inside an edge band
  (~12% of viewport height, min 48px) and sets a signed velocity that ramps from
  ~4px/frame at the inner edge of the band to ~24px/frame at the very edge
  (negative = up, positive = down). It starts the loop when velocity becomes
  nonzero and stops it when the pointer leaves the band.
- `#autoScrollTick` applies `scrollTop += velocity` (clamped to
  `[0, scrollHeight - clientHeight]`), then re-runs the range computation using
  the cached pointer position against the new scroll offset -- so a different
  item is now under the still finger and the range keeps growing. The y is
  clamped just inside the viewport so a finger parked exactly at the edge still
  hit-tests onto the edge-most item. The loop reschedules itself while scrolling
  and stops when clamped at either end.

Scheduling goes through `#ensureAutoScrollLoop`, which only schedules if no rAF
is already pending, so a `pointermove` arriving while a tick is queued cannot
spawn a second concurrent loop. The loop is torn down in `#handleSweepEnd` and
`disconnectedCallback` via `#stopAutoScroll`.

The top edge zone is not the raw gallery top: the selection controls bar (fixed
at the viewport top) and the sticky day + album headers overlay the top rows.
`#sweepTopEdge` returns the gallery top pushed down below the controls bar
(measured live via `getBoundingClientRect`) plus a fixed 72px for the sticky day
(36px) + album (36px) headers, so the upward auto-scroll zone -- and the tick's
re-hit-test clamp -- start where content is actually visible rather than behind
those overlays. The 72px is a constant kept in sync with the header CSS (same
convention as `pl-album`'s hardcoded `#album_name_height`).

The native scroll that `scrollTop` writes triggers the existing `scroll`
handler, which repaints newly revealed albums (`#selectivelyPaintAlbums`) and
updates the index marker -- so the thumbs being selected actually render as they
scroll into view. Programmatic `scrollTop` is unaffected by the sweep's
`touch-action: none`, so there is no conflict with the scroll suppression.

## Interaction summary

| Gesture | Result |
|---------|--------|
| Tap on image | Open slideshow (always, even mid-selection) |
| Tap on the 44px corner target | Toggle that item |
| Long-press a thumb | Toggle that item, arm a sweep |
| Long-press then drag | Select the anchor->current range in timeline order |
| Drag back over the range | De-select the overshoot (revert to baseline) |
| Hold near top/bottom edge while dragging | Auto-scroll and keep extending the range |

## Known limitations / TODO

- **Large-sweep performance is unverified on the full dataset.** Per-event
  selection bookkeeping in `#handleItemsSelected` is now O(k) in the number of
  newly (de)selected items (via a parallel `#selectedIds` set for duplicate
  detection), rather than the earlier O(n) rescan of the whole selection that
  made a range sweep O(n^2). Two O(n) costs remain, both proportional to the
  gallery size rather than per-frame: building `#sweepOrder`/`#sweepBaseline`
  once when a sweep arms, and the controls bar recomputing `distinctRatings`/
  `allPrivate` over the selection on each change. These are smooth on test data
  but unchecked on a large real collection. If the arm snapshot hitches, it can
  be made lazy/segmented; the `#selectedIds` set is also slated to become a
  `Map<id, item>` source of truth (see the TODO in `pl-gallery.js`).

## Browser targets

Per `.kiro/steering/browsers.md` the targets are modern Chrome (desktop and
Android) and Firefox desktop. Pointer Events, implicit pointer capture, and
`touch-action` behave as described on those. The gesture code is not tested on
Safari/iOS (out of scope).
