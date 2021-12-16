# Rewind-Replay: Relive your (captured) moments!

Rewind-Replay is ... ?

# Philosophy

1. We don't want to use cloud providers for personal photo collection.
2. Some of us really care about our media in folders that we have curated from a long time. With any new tool we use, we want support to continue to manage pics in folders, and create new folders for those new ones.
3. The single source of truth is the photo itself. We want all metadata, including user tags, ML based face / objects labels etc., to go back to the photo, to the extent possible.
4. In the same vein, we also want the tool to utlize the metadata already existing in the photos.

# Key Terms
1. **Photo / Video**: The individual photo / video (duh!)
2. **Album**: A group of related photos (and videos). For e.g. "2021-10-01 Trip to SVBF"
3. **Collection**: A set of related albums. For e.g. "My family pics", "My small-business pics" etc.
4. **Indexing**: The process of reading media and cataloging metadata for easy search afterwards. Also generates thumbnails.


# Features


## TODO

- config json
- parameter for config file
- use config in
    - database path
    - database file name
    - thumbnails path
    - defaults when no config is specified or value not found

- Image similarity

- Face recognition
    * first do face detection using blazeface
    * then do landmark detection, and use that as tensor
    * euclidean distance between faces
    * think about approaches when 
        1) no image labels are available
        2) image lables are available in the images being read! (my use case)

- 