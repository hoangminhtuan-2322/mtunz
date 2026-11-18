/* mtunz Mobile Viewport v1 — progressive keyboard and viewport stabilization.
   No chat data, tokens, contacts, location or message content is persisted. */
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const match=window.matchMedia?.('(max-width: 800px)');
 if(!match)return;
 const root=document.documentElement,body=document.body;
 let cleanHeight=0,frame=0,blurTimer=0;
 const editable=element=>{
  if(!element||typeof element.closest!=='function')return false;
  return !!element.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]),textarea,select,[contenteditable="true"]');
 };
 const isMobile=()=>match.matches;
 const visibleHeight=()=>{
  const vv=window.visualViewport;
  const n=Number(vv?.height||window.innerHeight||0);
  return n>0?n:0;
 };
 function syncViewport(){
  frame=0;
  if(!root||!body)return;
  if(!isMobile()){
   root.style.removeProperty('--mt-mobile-viewport-height');
   body.classList.remove('mt-mobile-keyboard','mt-mobile-editing');
   cleanHeight=0;
   return;
  }
  const typing=editable(document.activeElement);
  const visible=visibleHeight();
  const layout=Number(window.innerHeight||visible);
  if(!typing)cleanHeight=Math.max(visible,layout);
  if(!cleanHeight)cleanHeight=Math.max(visible,layout);
  const baseline=Math.max(cleanHeight,layout);
  const reduced=typing&&visible>0&&baseline-visible>110;
  body.classList.toggle('mt-mobile-editing',typing);
  body.classList.toggle('mt-mobile-keyboard',reduced);
  if(reduced)root.style.setProperty('--mt-mobile-viewport-height',Math.round(visible)+'px');
  else root.style.removeProperty('--mt-mobile-viewport-height');
 }
 function schedule(){
  if(frame)return;
  if(typeof window.requestAnimationFrame==='function')
   frame=window.requestAnimationFrame(syncViewport);
  else syncViewport();
 }
 function focusChanged(){schedule();}
 function blurChanged(){
  if(blurTimer)window.clearTimeout?.(blurTimer);
  blurTimer=window.setTimeout?window.setTimeout(schedule,80):0;
  if(!blurTimer)schedule();
 }
 document.addEventListener('focusin',focusChanged,true);
 document.addEventListener('focusout',blurChanged,true);
 document.addEventListener('visibilitychange',schedule);
 window.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('orientationchange',()=>{
  cleanHeight=0;schedule();
 },{passive:true});
 window.addEventListener('pageshow',schedule);
 match.addEventListener?.('change',schedule);
 window.visualViewport?.addEventListener?.('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener?.('scroll',schedule,{passive:true});
 syncViewport();
})();
