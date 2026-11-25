'use strict';
const LIGHT_PALETTE=Object.freeze({bg:'#f3f7fc',card:'#ffffff',border:'#c4d4e4',text:'#14263b',soft:'#4b6076',accent:'#075ba8',mine:'#d3e9ff',bad:'#a31d3b',green:'#08764e'});
function normalizeTheme(value){return value==='light'?'light':'dark';}
// Only the Messenger style sheet is transformed. Dark call/media overlays and
// specialized child screens retain their own styling.
const fills={
  btn:'#075ba8',danger:'#fce1e7',ghost:'#e1ebf7',top:'#ffffff',tabs:'#ffffff',
  tabActive:'#d3e9ff',filterChipActive:'#075ba8',errorBar:'#fce1e7',
  badge:'#075ba8',sendIconButton:'#075ba8',accountCount:'#075ba8',
  bubbleMine:LIGHT_PALETTE.mine,bubbleOther:'#ffffff',overlay:'#10263c80',
  viewerAction:'#1c3656',jumpLatest:'#075ba8',batchRemove:'#071320',
  wallpaperPreviewOther:'#ffffff',wallpaperPreviewMine:LIGHT_PALETTE.mine,
  statusDot:LIGHT_PALETTE.green,statusOffline:'#a35c00',statusIdle:'#718398',
  headerPeerOnline:LIGHT_PALETTE.green,activeDot:LIGHT_PALETTE.green,
  onlineBadge:LIGHT_PALETTE.green,chatPresenceOnline:LIGHT_PALETTE.green,
  chatPresenceAway:'#718398',notificationDot:LIGHT_PALETTE.accent,
  accountSymbolDanger:'#fce1e7',input:'#ffffff',composeInput:'#ffffff',
  compose:'#ffffff',stickyComposer:LIGHT_PALETTE.bg,replyBar:'#e7eff8',
  sheet:'#f3f7fc',detailsScreen:'#f3f7fc',wallpaperEmpty:'#f3f7fc',
  photoAttachment:'#dce6f1',thumb:'#dce6f1',filterChip:'#ffffff',
  chatRow:'#ffffff',accountGroupBody:'#ffffff',detailsCard:'#ffffff',
  section:'#ffffff',rowCard:'#ffffff',searchWrap:'#ffffff',
  wallpaperTile:'#ffffff',headerMark:'#dce9f6'
};
const textColors={
  btnTxt:'#ffffff',badge:'#ffffff',filterTextActive:'#ffffff',
  jumpLatestText:'#ffffff',accountCountText:'#ffffff',
  accountDangerText:LIGHT_PALETTE.bad,tabTextActive:LIGHT_PALETTE.accent,
  deviceCurrent:LIGHT_PALETTE.green,time:LIGHT_PALETTE.soft
};
function makeLightStyles(source,dark){
  return Object.fromEntries(Object.entries(source).map(([name,style])=>{
    const next={...style};
    for(const key of Object.keys(next)){
      const value=next[key];
      if(typeof value!=='string')continue;
      if(key==='backgroundColor'){
        next[key]=fills[name]||(value===dark.bg?LIGHT_PALETTE.bg:value===dark.card?LIGHT_PALETTE.card:value===dark.green?LIGHT_PALETTE.green:value===dark.accent?LIGHT_PALETTE.accent:'#e1ebf7');
      }else if(/^border.*Color$/.test(key)){
        next[key]=name==='foundBubble'?'#a15d00':name==='wallpaperSelected'||name==='filterChipActive'?'#075ba8':LIGHT_PALETTE.border;
      }else if(key==='color'){
        next[key]=textColors[name]||(value===dark.accent?LIGHT_PALETTE.accent:value===dark.soft?LIGHT_PALETTE.soft:value===dark.bad?LIGHT_PALETTE.bad:value===dark.green?LIGHT_PALETTE.green:LIGHT_PALETTE.text);
      }
    }
    return [name,next];
  }));
}
function wallpaperColor(option,mode){return option.id==='midnight'&&mode==='light'?LIGHT_PALETTE.bg:option.color;}
// Explicit semantic color overrides for other screens; preserve all layout fields.
function makeScreenLightStyles(source,overrides){
  return Object.fromEntries(Object.entries(source).map(([name,style])=>{
    const next={...style};
    for(const key of Object.keys(next)){
      if(typeof next[key]!=='string')continue;
      if(key==='backgroundColor')next[key]='#e7eff8';
      else if(/^border.*Color$/.test(key))next[key]=LIGHT_PALETTE.border;
      else if(key==='color')next[key]=LIGHT_PALETTE.text;
    }
    return [name,{...next,...overrides[name]}];
  }));
}
module.exports={LIGHT_PALETTE,normalizeTheme,makeLightStyles,wallpaperColor,makeScreenLightStyles};
