'use strict';
function validApiOrigin(origin,dev=false){
  if(typeof origin!=='string'||origin.length>300)return false;
  const match=/^(https?):\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i.exec(origin);
  if(!match||(!dev&&match[1]!=='https')||match[2].includes('..'))return false;
  return !match[3]||(Number(match[3])>=1&&Number(match[3])<=65535);
}
function validApiPath(path){
  if(typeof path!=='string'||path.length>8192||!path.startsWith('/api/')||/[\x00-\x20\x7f\\#]/.test(path))return false;
  const route=path.split('?')[0];
  return !route.includes('//')&&!route.split('/').some(part=>part==='.'||part==='..')&&!/%(?:2e|2f|5c|00|25)/i.test(route);
}
function validSessionToken(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{30,128}$/.test(value);}
function validResponseObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
module.exports={validApiOrigin,validApiPath,validSessionToken,validResponseObject};
