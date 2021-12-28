# Rewind-Replay: Relive your (captured) moments!

Rewind-Replay is ... ?

# Philosophy

1. We don't want to use cloud providers for personal photo collection.
2. Some of us really care about our media in folders that we have meticulously curated from a long time. With any tool, we want the ability to continue to manage pics in folders.
3. The single source of truth is the photo itself. We want all metadata, including user tags, ML based face / objects labels etc., to go back to the photo, to the extent possible.
4. In the same vein, we also want the tool to utlize the metadata already existing in the photos.
5. Some kind of sensible, not too constrained search is needed, even though it may (will) not be as good as Google.


# Key Terms
1. **Photo / Video**: The individual photo / video (duh!)
2. **Album**: A group of related photos (and videos). For e.g. "2021-10-01 Trip to SVBF"
3. **Collection**: A set of related albums. For e.g. "My family pics", "My small-business pics" etc.
4. **Indexing**: The process of reading media and cataloging metadata to help with search. Also thumbnail generation.


# Features


# Architecture
## Main
- nodejs server
- SQLite 3 database
- Vuejs front-end (TODO)

## Supporting
- Sqlite3 provided FTS5 for searches
- sharp for image operations
- fluent-ffmpeg for video operations
- exiftool-vendored for metadata read / write
- github "like" search syntax using search-query-parser
- Use browser native features (HTML5) to play videos


## TODO

- Image similarity

- Face recognition
    * first do face detection using blazeface
    * then do landmark detection, and use that as tensor
    * euclidean distance between faces
    * think about approaches when 
        1) no image labels are available
        2) image lables are available in the images being read! (my use case)

- 