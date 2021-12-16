
export async function getMetadata(exiftool, file){
  let tags = await exiftool.read(file);

  let fileType = (tags["MIMEType"]||"x").split("/")[0],
    w=tags.ImageWidth, h=tags.ImageHeight,
    aspectRatio=0;

  // we'll be rotating the thumbnails where appliable
  // so calculate the aspect ratio considering the rotated image
  if (w && h && ["image","video"].indexOf(fileType)>=0){
    switch(fileType){
      case "image":
        aspectRatio = tags.Orientation ? 
          ([6,8].indexOf(tags.Orientation) >=0) ? h/w : w/h
          : w/h;
        break;

      case "video":
        aspectRatio = tags.Rotation ? 
          ([90,270].indexOf(tags.Rotation) >=0) ? h/w : w/h
          : w/h;
        break;
    }
  }

  return {
    description: (tags.ImageDescription || ' ').trim(),
    filesize: tags.FileSize||null,
    ext: tags.FileName.split(".").pop().toLowerCase(),
    mimetype: tags.MIMEType||null,
    keywords: tags.Keywords ? ((typeof(tags.Keywords) == "string") ?  tags.Keywords : tags.Keywords.join(", ")) : null,
    faces: tags.RegionInfo ? tags.RegionInfo.RegionList.filter(d=>d.Type='Face').map(d=>d.Name).join(", ") : null,
    objects: tags.RegionInfo ? tags.RegionInfo.RegionList.filter(d=>d.Type!='Face').map(d=>d.Name).join(", ") : null,
    xmpregion: tags.RegionInfo,
    rating: tags.Rating||null,
    imagesize: tags.ImageSize||null,
    aspectratio: aspectRatio,
    make: tags.Make||null,
    model: tags.Model||null,
    orientation: tags.Orientation||tags.Rotation||null,
    gpsposition: tags.GPSPosition||null,
    duration: tags.MediaDuration||null,
    region_applied_to_dimension_w: tags.RegionInfo ? 
      tags.RegionInfo.AppliedToDimensions.W : null,
    region_applied_to_dimension_h: tags.RegionInfo ? 
      tags.RegionInfo.AppliedToDimensions.H : null,
    region_applied_to_dimension_unit: tags.RegionInfo ? 
      tags.RegionInfo.AppliedToDimensions.Unit : null,
    datetime_original: tags.DateTimeOriginal ? tags.DateTimeOriginal.toString() : null,
    create_date: tags.CreateDate ? tags.CreateDate.toString() : null,
    file_modify_date: tags.FileModifyDate ? tags.FileModifyDate.toString() : null,
    file_date: tags.DateTimeOriginal ? tags.DateTimeOriginal.toString() : (tags.CreateDate ? tags.CreateDate.toString() : (tags.FileModifyDate.toString() ))
  }
}