export function ProcessDataInChunks(){
  var arr=[], maxItemsBeforeScoop=100, maxWaitTimeBeforeScoopMS=5000, timer, invokeFunction;
  function my(){

  }

  // invokeFunction = async function(){
  //   // dummy initiator function
  //   // needs to be set by the user
  // }

  my.add = function(e){
    arr.push(e);
    resetTimer();
    process();
    return my;  // enable chaining
  }

  const resetTimer = function(){
    clearTimeout(timer)
    timer = setTimeout(doTask, maxWaitTimeBeforeScoopMS)
  }

  const doTask = function(){
    clearTimeout(timer);
    let scoop = arr.splice(0, arr.length);
    // don't care about return value of promise
    // promise is used only for async / non-blocking work
    invokeFunction(scoop)
      .then(console.log('HERE! invokeFunction done')); // TODO: emit return value?
    ;
  }

  process = function(){
    if(arr.length >= maxItemsBeforeScoop){
      doTask()
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
