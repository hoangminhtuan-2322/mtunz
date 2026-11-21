'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox']
 });
 try{
  const base='http://127.0.0.1:8791';
  const page=await browser.newPage();
  try{
   const failures=[];
   page.on('pageerror',error=>failures.push(error.message));
   await page.goto(base+'/?utm_source=chatgpt.com&room=2#latest');
   await page.waitForURL(base+'/?room=2#latest');
   assert.equal(page.url(),base+'/?room=2#latest');
   await page.goto(base+'/?utm_source=newsletter&room=2#latest');
   assert.equal(page.url(),base+'/?utm_source=newsletter&room=2#latest');
   await page.goto(base+'/?utm_source=chatgpt.com');
   await page.waitForURL(base+'/');
   assert.equal(page.url(),base+'/');
   assert.deepEqual(failures,[],'URL cleanup must not break application boot');
  }finally{await page.close();}
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
