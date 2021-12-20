import * as fs from 'fs';
import * as path from 'path';
import {default as sharp} from 'sharp';

import {config} from './config.mjs';

const sizes = [
  // thumbnails with same aspect ratio as original image
  {height: 20,  fit: 'inside', suffix: 'fit'},  // small thubnail to give the feel of "loading"
  // {height: 50,  fit: 'inside', suffix: 'fit'},
  {height: 100, fit: 'inside', suffix: 'fit'},
  {height: 250, fit: 'inside', suffix: 'fit'},
  {height: 500, fit: 'inside', suffix: 'fit'},

  // square thumbnails
  {width: 50,  height: 50,  fit: 'cover', suffix: 'center'},
  // {width: 100, height: 100, fit: 'cover', suffix: 'center'},
];

const thumbsDir = config.thumbsDir || 
  config.dataDir ? 
    path.join(config.dataDir, 'thumbnails') :
    path.join('data', 'thumbnails')
;

export async function exctractAndSaveThumbnails(imgObject){
  // read image once
  let buf = fs.readFileSync(imgObject.filename);

  // We don't want all thumbnails in one directory. Hence, create
  // sub-dirs based on the first 3 chars of the uuid.
  // If we have the uuid in the front end, we can directly go to the
  // location of the thumbnails.
  // Idea found at: https://stackoverflow.com/a/2994603

  let imageThumbsDir = path.join(
    thumbsDir,
    ...Array.from(imgObject.uuid).slice(0,3)    // 3 levels deep
  )

  if(!fs.existsSync(imageThumbsDir)){
    fs.mkdirSync(imageThumbsDir, {recursive: true})
  }

  var resizePromises = sizes.map(s=>{
    // return a promise
    sharp(buf)
      .rotate()  // rotate based on exif Orientation
      .resize(s)
      .toFile(path.join(
        imageThumbsDir,
        `${imgObject.uuid}_${s.height}_${s.suffix}.jpg`
      ))
    ;
  });

  // var faceExtractPromises=[];

  // TODO: extract and return image hash (to help identify dups)

  let start = performance.now()
  await Promise.all(resizePromises)
  console.log(`${imgObject.filename} generated ${sizes.length} thumbnails in ${performance.now()-start} ms`)
}
