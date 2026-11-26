const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ui=read('mobile/src/FishingLife.js'),messenger=read('mobile/src/Messenger.js');
assert(ui.includes('useWindowDimensions()'));
assert(ui.includes('width>=800&&fontScale<1.35'));
assert(ui.includes('width<380||height<640'));
assert(ui.includes('wide&&s.lakeColumn')&&ui.includes('wide&&s.bagColumn'));
assert(ui.includes('minHeight:44')&&ui.includes('primary:{minHeight:56'));
assert(ui.includes('!cast&&<>')&&ui.includes('height={cast?'));
assert(ui.includes("api('/api/fishing/'+action")&&ui.includes('signal:abort.signal'));
assert(!ui.includes('WebView'));
assert(messenger.includes("<FishingLife token={token} onExpired={onExpired}"));
assert(messenger.includes("title=\"Fishing Life\""));
assert(messenger.includes("onPress={()=>setTab('fishing')}"));
console.log('Native Fishing responsive and navigation source contracts passed.');

const art=read('mobile/src/FishingArt.js');assert(art.includes('useNativeDriver:true')&&art.includes('reduceMotionChanged')&&art.includes('AppState.addEventListener'));assert(ui.includes('<FishingScene')&&ui.includes('<FishingIcon'));for(const [prefix,count] of [['scene',3],['fish',30],['rod',5]])for(let i=0;i<count;i++){const name=prefix+'-'+i+'.svg';assert.equal(read('static/fishing-art/'+name),read('mobile/assets/fishing/'+name));assert(art.includes("require('../assets/fishing/"+name+"')"));}
