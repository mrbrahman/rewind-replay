# Rewind-Replay: Relive your (captured) moments!

Rewind-Replay is ... ?

# Intended audience



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