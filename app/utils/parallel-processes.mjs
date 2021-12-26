/*
  ParallelProcesses

  Run processes (functions) in parallel using controlled concurrency,
  with the ability the change concurrency even as the processes are running!

  Note: Promises are used to enable concurrent runs. However, at the end of
  promise completion, a promise is NOT returned (unlike the conventional way).
  TODO: Instead the result is emitted as a event.
*/

export function ParallelProcesses(){
  var maxConcurrency=1, processInInsertOrder=false, autoStart=true;
  let queue=[], processingCnt=0, pendingCnt=0, completedCnt=0, failedCnt=0, paused=false;
  
  function my(){
    // nothing much to do here
  }

  // need to call this as: p.enqueue(()=>fun(arg))
  // otherwise, function will get executed immediately, and promise will get resolved!
  my.enqueue = function(promiseGenerator){
    queue.push(promiseGenerator); // assume it is a promise
    pendingCnt++;
    if(autoStart)
      dequeue();
    
    return my; // TODO: decide??
  }

  my.enqueueMany = function(promiseGenerators){
    noOfEntries = promiseGenerators.length;
    queue.push(...promiseGenerators);
    // TODO: check/read-up performance of spread above vs. 
    //    Array.prototype.push.apply(queue, promiseGenerators);
    pendingCnt+=noOfEntries;
    if(autoStart)
      dequeue();

    return my; // TODO: decide?
  }

  // this one is not exposed
  let dequeue = function(){
    if (!paused && processingCnt<maxConcurrency && queue.length>0){
      processingCnt++; pendingCnt--;
      let item = processInInsertOrder ? queue.shift() : queue.pop();
      
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

  my.processInInsertOrder = function(_){
    return arguments.length ? (processInInsertOrder = _, my): processInInsertOrder;
  }

  my.autoStart = function(_){
    return arguments.length ? (autoStart = _, my): autoStart;
  }

  my.stats = function(){
    return {
      processingCnt, pendingCnt, completedCnt, failedCnt, paused
    }
  }

  return my;
}