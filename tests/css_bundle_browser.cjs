'use strict';
/* Real production build contract: one content-addressed stylesheet, loaded
   without regressions on desktop and mobile before shipping to Render. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [320,390,768,801,1024,1440]){
   const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
   const errors=[],failed=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('requestfailed',r=>{if(r.url().includes('mtunz-styles-'))failed.push(r.url());});
   try{
    const response=await page.goto('http://127.0.0.1:8791/');
    assert.equal(response.status(),200);
    const style=page.locator('link[rel="stylesheet"]');
    assert.equal(await style.count(),1,'Only one CSS request at '+width);
    const href=await style.getAttribute('href');
    assert.match(href,/^\/static\/mtunz-styles-[0-9a-f]{16}\.css$/);
    const stylesheet=await page.request.get('http://127.0.0.1:8791'+href);
    assert.equal(stylesheet.status(),200);
    assert.match(stylesheet.headers()['cache-control'],/public/);
    assert(!stylesheet.headers()['set-cookie'],'Shared CSS response must not set any cookie');
    assert((await stylesheet.body()).byteLength>100_000);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Bundled CSS must not overflow viewport '+width);
    assert.deepEqual(errors,[],'No JavaScript error at '+width);
    assert.deepEqual(failed,[],'CSS should load at '+width);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
