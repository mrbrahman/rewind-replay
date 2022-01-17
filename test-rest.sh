curl -X POST -H 'Content-Type: application/json' -d '{"collection_name":"Test","collection_path":"/home/shreyas/Projects/test-collection/","album_type":"FOLDER_ALBUM","listen_paths":["/home/shreyas/Projects/test-collection-new-files/"],"apply_folder_pattern":"yyyy/yyyy-mm-dd","default_collection":1}' "http://localhost:9000/createNewCollection"

curl -X GET 'http://localhost:9000/getAllCollections'

time curl -X POST 'http://localhost:9000/startIndexingFirstTime?collection_id=1'

curl -X GET 'http://localhost:9000/getIndexerStatus' | jq '.'

curl -X PUT 'http://localhost:9000/pauseIndexer'

curl -X PUT 'http://localhost:9000/updateIndexerConcurrency/2'

curl -X PUT 'http://localhost:9000/resumeIndexer'
