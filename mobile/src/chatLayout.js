'use strict';
// Use available logical pixels rather than model names or fixed screen sizes.
// Reserve enough space for the title and message text at larger font scales.
function chatLayout(width,fontScale=1,scope='dm'){
  const w=Number.isFinite(width)&&width>0?width:320;
  const scale=Number.isFinite(fontScale)?Math.max(1,Math.min(2,fontScale)):1;
  return {
    compactHeader:scope==='dm'?w<460+80*(scale-1):scope==='group'?w<340+80*(scale-1):false,
    compactComposer:w<390+90*(scale-1),
  };
}
module.exports={chatLayout};
