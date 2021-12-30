import * as fs from 'fs';
import * as path from 'path';
import {default as sharp} from 'sharp';

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

export async function createAndSaveThumbnails(imgObject){
  // read image once
  let buf = fs.readFileSync(imgObject.filename);

  // image thumbnails creation

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

  let resizePromises = sizes.map(s=>{
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

  // Face extraction
  let faceExtractPromises=[];
  
  if(imgObject.xmpregion
    && imgObject.xmpregion.RegionList.filter(d=>d.Type=='Face').length > 0
    && imgObject.xmpregion.AppliedToDimensions.Unit == 'pixel') // TODO: don't know what to do with others just yet
  {
    let {W, H} = imgObject.xmpregion.AppliedToDimensions;

    if(W != imgObject.ImageWidth || H != imgObject.ImageHeight){
      // TODO: what should we do when RegionAppliedToDimensions don't match image height and width?
      console.warn(`${imgObject.filename} has different region diemnsions! Actual ${imgObject.ImageWidth}x${imgObject.ImageWidth} vs ${W}x${H}`)
    } 

    let faces = imgObject.xmpregion.RegionList.filter(d=>d.Type=='Face');
    for(let face of faces){

      let faceDir = path.join(facesDir, face.Name);
      if(!fs.existsSync(faceDir)){
        fs.mkdirSync(faceDir, {recursive: true})
      }

      // Note: xmp stores X and Y as center of the area
      let [left, width] = [face.Area.X-face.Area.W/2, face.Area.W].map(x=>Math.floor(x*W))
      let [top, height] = [face.Area.Y-face.Area.H/2, face.Area.H].map(x=>Math.floor(x*H))
      console.log(`${imgObject.filename} extracting ${left} ${top} ${width} ${height} for ${face.Name}`);
      
      // add a promise
      let facePromise = sharp(buf)
        .extract({
          left: left,
          top: top,
          width: width,
          height: height
        })
        // rotate the image. need to specify orientation, since we lost it during extract
        .rotate(imgObject.Orientation)
        // TODO: same face appearing multiple times in the image? for e.g a photo in a photo?
        .toFile(path.join(faceDir, `${imgObject.uuid}.jpg`))
      ;
      faceExtractPromises.push(facePromise);
    }
  }
  
  let start = performance.now();
  await Promise.all([...resizePromises, ...faceExtractPromises]);

  // TODO: extract and return image hash (to help identify dups)

  console.log(`${imgObject.filename} generated ${sizes.length} thumbnails in ${performance.now()-start} ms`)
}
