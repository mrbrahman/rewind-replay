import * as fs from 'fs';
import * as path from 'path';
import {default as sharp} from 'sharp';
import {default as ffmpeg} from 'fluent-ffmpeg';

import {config} from '../../config.mjs';

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

// TODO: Should face extraction be moved to a separate file?
const facesDir = config.facesDir || 
  config.dataDir ? 
    path.join(config.dataDir, 'faces') :
    path.join('data', 'faces')
;

// Not Samsung phones have issue, which needs {failOnError: true}
// when reading the image / buffer with sharp
// https://github.com/lovell/sharp/issues/1578

export async function createImageThumbnails(uuid, buf){
  // We don't want all thumbnails in one directory. Hence, create
  // sub-dirs based on the first 3 chars of the uuid.
  // If we have the uuid in the front end, we can directly go to the
  // location of the thumbnails.
  // Idea found at: https://stackoverflow.com/a/2994603

  let start = performance.now();
  let imageThumbsDir = path.join(
    thumbsDir,
    ...Array.from(uuid).slice(0,3)    // 3 levels deep
  )

  if(!fs.existsSync(imageThumbsDir)){
    fs.mkdirSync(imageThumbsDir, {recursive: true})
  }

  let thumbnailPromises = sizes.map(s=>{
    // return a promise
    sharp(buf, { failOnError: false })
      .rotate()  // rotate based on exif Orientation
      .resize(s)
      .toFile(path.join(
        imageThumbsDir,
        `${uuid}_${s.height}_${s.suffix}.jpg`
      ))
    ;
  });
  
  await Promise.all(thumbnailPromises);
  console.log(`thumbs: For ${uuid} generated ${sizes.length} thumbnails in ${performance.now()-start} ms`);

  // TODO: extract and return image hash? (to help identify dups)
}


export async function extractFaceRegions(uuid, buf, xmpregion) {
  let start = performance.now();
  
  let faceExtractPromises = [];
  let faces = xmpregion.RegionList.filter(d => d.Type == 'Face');
  
  for (let face of faces) {

    let faceDir = path.join(facesDir, face.Name);
    if (!fs.existsSync(faceDir)) {
      fs.mkdirSync(faceDir, { recursive: true });
    }

    let { W, H } = xmpregion.AppliedToDimensions;

    // Note: xmp stores X and Y as center of the area
    let [left, width] = [face.Area.X - face.Area.W / 2, face.Area.W].map(x => Math.floor(x * W));
    let [top, height] = [face.Area.Y - face.Area.H / 2, face.Area.H].map(x => Math.floor(x * H));
    console.log(`${uuid} extracting ${left} ${top} ${width} ${height} for ${face.Name}`);

    // add a promise
    let facePromise = sharp(buf, { failOnError: false })
      .withMetadata() // keep metadata to help with rotation after extract
      .extract({
        left: left,
        top: top,
        width: width,
        height: height
      })
      .toBuffer()
      .then((faceBuf)=>{
        sharp(faceBuf)
          // rotate the image, and lose the metadata
          .rotate()
          // TODO: same face appearing multiple times in the image? for e.g a photo in a photo?
          .toFile(path.join(faceDir, `${uuid}.jpg`)) 
      })
    ;
    
    faceExtractPromises.push(facePromise);
  }

  await Promise.all(faceExtractPromises);
  console.log(`faces: For ${uuid} generated ${faceExtractPromises.length} in ${performance.now()-start} ms`)
}

export async function generateVideoThumbnail(uuid, videoFilename){
  // convert the callback into a Promise, so caller can "await"
  return new Promise((resolve,reject)=>{
    // use the same thumbnails dir to store vide thumbnail (screenshot) as well.
    // in case of videos, we additionally store the full video screenshot,
    // and extract image thumbnails from that video screenshot
    let videoThumbsDir = path.join(
      thumbsDir,
      ...Array.from(uuid).slice(0,3)    // 3 levels deep
    );
    if (!fs.existsSync(videoThumbsDir)) {
      fs.mkdirSync(videoThumbsDir, { recursive: true });
    }

    ffmpeg(videoFilename)
      .on('error', (error)=>{
        console.log(`FFMpeg error for ${videoFilename}: ${error}`)
        reject(error)
      })
      .thumbnail({
        count: 1,
        folder: videoThumbsDir,
        filename: `${uuid}.jpg`
      })
      .on("end", async function(){
        // return with video screenshot filename
        resolve(path.join(videoThumbsDir, `${uuid}.jpg`))
      })
    ;
  })
}

export function deleteImageThumbnails(uuid){
  let dir = path.join(
    thumbsDir,
    ...Array.from(uuid).slice(0,3)
  );

  if(fs.existsSync(dir)){
    fs.readdirSync(dir)
      .filter(f=>f.startsWith(uuid))
      .forEach(f=>fs.unlinkSync(path.join(dir,f)))
    ;
  }
}

export function deleteFaceThumbnails(uuid){
  let dir = path.join(
    facesDir,
    ...Array.from(uuid).slice(0,3)
  );

  if(fs.existsSync(dir)){
    fs.readdirSync(dir)
      .filter(f=>f.startsWith(uuid))
      .forEach(f=>fs.unlinkSync(path.join(dir,f)))
    ;
  }
}

