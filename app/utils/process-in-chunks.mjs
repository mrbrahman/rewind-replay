function ProcessInChunks(){
  var arr=[], maxItemsBeforeScoop=100, maxWaitTimeBeforeScoopMS=5000, timer;
  function my(){

  }

  invokeFunction = async function(){
    // dummy initiator function
    // needs to be set by the user
  }

  my.add = function(e){
    arr.push(e);
    resetTimer();
    process();
    //return arr.length;
  }

  resetTimer = function(){
    clearTimeout(timer)
    timer = setTimeout(doDbTask, maxWaitTimeBeforeScoopMS)
  }

  doDbTask = function(){
    clearTimeout(timer);
    let scoop = arr.splice(0, arr.length);
    invokeFunction(scoop)
      .then(console.log('done'))
    ;
  }

  process = function(){
    if(arr.length >= maxItemsBeforeScoop){
      doDbTask()
    }
  }

  my.stats = function(){
    return arr.length;
  }

  my.maxItemsBeforeScoop = function(_){
    return arguments.length ? (maxItemsBeforeScoop = _, my): maxItemsBeforeScoop;
  }

  my.maxWaitTimeBeforeScoopMS = function(_){
    return arguments.length ? (maxWaitTimeBeforeScoopMS = _, my): maxWaitTimeBeforeScoopMS;
  }

  // use this with ()=>fn() syntax - so the function does not get
  // executed immediately!
  // also fn() needs to be an async function / return a promise
  my.invokeFunction = function(_){
    return arguments.length ? (invokeFunction = _, my): invokeFunction;
  }

  return my;
}

// TODO
// var createMetadataDbInChunks = ProcessInChunks().invokeFunction((_)=>db.createNewMetadataBulk(_))

// indexer-of-files
// createMetadataDbInChunks.add(p)
