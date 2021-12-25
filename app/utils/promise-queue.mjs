export function PromiseQueue(){
  var maxConcurrency=1, stickToInsertOrder=false, autoStart=true;
  let queue=[], processingCnt=0, pendingCnt=0, completedCnt=0, failedCnt=0, paused=false;
  
  function my(){
    // nothing much to do here
  }

  my.enqueue = function(promiseGenerator){
    queue.push(promiseGenerator); // assume it is a promise
    pendingCnt++;
    if(autoStart)
      dequeue();
    
    return my; // ??
  }

  // this one is not exposed
  let dequeue = function(){
    if (!paused && processingCnt<maxConcurrency && queue.length>0){
      processingCnt++; pendingCnt--;
      let item = stickToInsertOrder ? queue.shift() : queue.pop();
      
      item()
        .then(returnValue=>{
          processingCnt--; completedCnt++;
          // emit success
          // emit return value?
          console.log(returnValue)
        })
        .catch(error=>{
          processingCnt--; failedCnt++;
          // emit failed
        })
        .finally(()=>dequeue())
    }
  }

  my.start = function(){
    dequeue()
  }

  my.pause = function(){
    paused = true;
  }

  my.resume = function(){
    paused = false;
    my.start()
  }

  my.maxConcurrency = function(_){
    // TODO: handle 0 value
    return arguments.length ? (maxConcurrency = _, my): maxConcurrency;
  }

  my.stickToInsertOrder = function(_){
    return arguments.length ? (stickToInsertOrder = _, my): stickToInsertOrder;
  }

  my.autoStart = function(_){
    return arguments.length ? (autoStart = _, my): autoStart;
  }

  my.stats = function(){
    return {
      processingCnt, pendingCnt, completedCnt, failedCnt
    }
  }

  return my;
}