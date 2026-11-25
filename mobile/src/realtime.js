'use strict';

// A server window may resolve after a newer WebSocket event. Only replace the
// overlapping IDs; never discard already received messages outside the window.
function mergeRecentWindow(existing, recent) {
  if (!recent.length) return existing;
  const ids = recent.map(message => Number(message.id));
  const first = Math.min(...ids);
  const last = Math.max(...ids);
  const kept = existing.filter(message => Number(message.id) < first || Number(message.id) > last);
  return [...new Map([...kept, ...recent].map(message => [Number(message.id), message])).values()]
    .sort((left, right) => Number(left.id) - Number(right.id));
}

// Coalesce refresh intents without allowing a list-only event to cancel a
// pending catch-up from a reconnect (or vice versa).
function createRefreshQueue(flush, delay = 300) {
  let timer = null;
  let all = false;
  let stopped = false;
  const pending = new Set();
  const schedule = kinds => {
    if (stopped) return;
    if (kinds == null) all = true;
    else for (const kind of kinds) pending.add(kind);
    // A fixed coalescing window guarantees progress during sustained traffic.
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      const work = all ? null : [...pending];
      pending.clear();
      all = false;
      if (!stopped) flush(work);
    }, delay);
  };
  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending.clear();
  };
  return {schedule, stop};
}

// Compare only JSON-compatible server data, not native components or callbacks.
// Preserve previous row references when a REST window repeats identical content.
function equalPayload(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);
  if(keys.length!==Object.keys(b).length)return false;
  return keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equalPayload(a[k],b[k]));
}
function reuseMessageRows(previous,next){
  const index=new Map(previous.map(row=>[Number(row.id),row]));
  const rows=next.map(row=>{const old=index.get(Number(row.id));return old&&equalPayload(old,row)?old:row;});
  return rows.length===previous.length&&rows.every((row,i)=>row===previous[i])?previous:rows;
}
function upsertMessage(previous,row){
  const id=Number(row.id);
  if(!Number.isSafeInteger(id)||id<=0)return previous;
  const last=previous[previous.length-1];
  if(!last||Number(last.id)<id)return [...previous,row];
  let lo=0,hi=previous.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(Number(previous[mid].id)<id)lo=mid+1;else hi=mid;}
  if(Number(previous[lo]?.id)===id){
    if(equalPayload(previous[lo],row))return previous;
    const next=previous.slice();next[lo]=row;return next;
  }
  return [...previous.slice(0,lo),row,...previous.slice(lo)];
}
// One in-flight refresh plus one trailing refresh. All callers queued during
// an active request share the trailing result, so a mutation cannot be missed.
function createSerialRefresh(work){
  let running=false,queued=null;
  function launch(batch){
    running=true;
    Promise.resolve().then(work).then(batch.resolve,batch.reject).finally(()=>{
      if(queued){const next=queued;queued=null;launch(next);}
      else running=false;
    });
  }
  return function refresh(){
    if(running&&queued)return queued.promise;
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const batch={promise,resolve,reject};
    if(running)queued=batch;else launch(batch);
    return promise;
  };
}
function reconnectDelay(base,random=Math.random()){
  return Math.min(30000,Math.max(600,Math.round(base*(0.8+Math.max(0,Math.min(1,random))*0.4))));
}
module.exports = {createRefreshQueue, mergeRecentWindow,reuseMessageRows,upsertMessage,createSerialRefresh,reconnectDelay};
