
import {EventEmitter} from 'events';


export function ProcessDataInChunks(){
  var arr=[], maxItemsBeforeScoop=100, maxWaitTimeBeforeScoopMS=5000, timer, invokeFunction, emitter;
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
      .then(returnValue=>{
        if(emitter){
          emitter.emit('ran', returnValue)
        }
      });
    ;
  }

  process = function(){
    if(arr.length >= maxItemsBeforeScoop){
      doTask()
    }
  }

  // provide an ability to run immediately, for e.g. cleanup during shutdown
  my.runNow = function(){
    doTask()
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

  my.emitter = function(_){
    if(arguments.length){
      if(!_ instanceof EventEmitter){
        throw 'Emitter parameter is not an instance of EventEmitter class!'
      } else {
        emitter = _;
      }
      return my;
    } else {
      return emitter ? true : false;
    }
  }

  return my;
}

