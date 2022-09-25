# Rewind-Replay: Relive your (captured) moments!

Rewind-Replay is no frills, self-hosted photos app that helps in organizing and more importantly searching your photos.

# Philosophy

1. We don't want to use cloud providers for personal photo collection.
2. Some of us really care about our media in folders that we have meticulously curated from a long time. With any tool, we want the ability to continue to manage pics in folders.
3. The single source of truth is the photo itself. We want all metadata, including user tags, ML based face / objects labels etc., to go back to the photo, to the extent possible.
4. In the same vein, we also want the tool to utlize the metadata already existing in the photos.
5. In other words, we don't want to be locked-down by any one particular tool.
6. Some kind of sensible, not too constrained search is needed, even though it may (will) not be as good as Google.


# Key Terms
1. **Photo / Video**: The individual photo / video (duh!)
2. **Album**: A group of related photos (and videos). For e.g. "2021-10-01 Trip to SVBF"
3. **Collection**: A set of related albums. For e.g. "My family pics", "My small-business pics" etc.
4. **Indexing**: The process of reading media and cataloging metadata to help with search. Also thumbnail generation.


# Current Features
- Index media photos, videos and audio
- Search photos based on their metadata

TODO: add screenshots of current features

# Features TODO
**Near future**
- Slideshow
- Mark as favorite / stars
- Add/change "tags" (keywords)
- Optional staging area
- Ability to move / delete files
- Ability to rename files (mainly videos) similar to folders

**After near future**
- An acutal form to setup collections
- Ability to upload photos from device
- Intelligent scrollbar (folder levels?)
- Status bar for Indexer
- Face recognition
- Object detection (computer vision)
- Clustering photos on map
- PWA


# Architecture
## Main
- nodejs server
- SQLite 3 database

## Supporting
- Sqlite3 provided FTS5 for searches
- sharp for image operations
- fluent-ffmpeg for video operations
- exiftool-vendored for metadata read / write
- github "like" search syntax using search-query-parser
- Use browser native features (HTML5) to play videos

## Softwares needed pre-installed
- [SQLite3](https://www.sqlite.org/download.html) (for better-sqlite3)
- [ffmpeg](https://ffmpeg.org/download.html) (for fluent-ffmpeg)
- (for future) g++ (for tensorflow.js)


Run `sudo apt install sqlite3 g++ ffmpeg` on Linux OS.
