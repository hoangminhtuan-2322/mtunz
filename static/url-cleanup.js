/* Keep mtunz URLs clean when an incoming ChatGPT link appends its UTM tag.
   Remove ONLY that specific query pair, preserving all other parameters,
   fragments, route paths, and browser history. No redirects or network calls. */
(function stripChatGPTSourceFromAddress(){
 'use strict';
 try{
  const current=new URL(window.location.href);
  if(current.searchParams.get('utm_source')!=='chatgpt.com')return;
  current.searchParams.delete('utm_source');
  const clean=current.pathname+current.search+current.hash;
  window.history.replaceState(window.history.state,'',clean);
 }catch(_error){
  // URL cleanup is cosmetic; it must never interrupt sign-in or app boot.
 }
})();