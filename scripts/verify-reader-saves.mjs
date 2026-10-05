import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium } from 'playwright';
process.loadEnvFile(join(process.cwd(), '.env.local'));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = `save-check-${randomUUID()}@example.test`;
const password = randomUUID();
const paperId = randomUUID();
const base = process.env.READER_SAVE_BASE_URL ?? 'http://localhost:3000';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
let userId, browser;
const check = (r) => { if(r.error) throw new Error(r.error.message); return r.data; };
(async () => {
  userId = check(await db.auth.admin.createUser({email,password,email_confirm:true})).user.id;
  check(await db.from('papers').insert({id:paperId,title:'Reader save verification',authors:['Local test'],categories:[]}));
  const html = Array.from({length:35},(_,i)=>`<p data-blk="${i}">${i===0?'Diffusion models are great. ':''}Local verification paragraph ${i}. This fixture checks reliable reading progress and private notes across browser sessions.</p>`).join('');
  check(await db.from('paper_content').insert({paper_id:paperId,kind:'html',sanitized_html:html}));
  const cookies=[];
  const client = createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>cookies,setAll: values=>{for(const v of values){const i=cookies.findIndex(c=>c.name===v.name);if(i>=0)cookies.splice(i,1);cookies.push(v);}}}});
  check(await client.auth.signInWithPassword({email,password}));
  browser=await chromium.launch({
    ...(process.env.READER_SAVE_CHROMIUM ? {executablePath:process.env.READER_SAVE_CHROMIUM} : {}),
    headless:true,args:['--no-sandbox']
  });
  const context=await browser.newContext({viewport:{width:1100,height:800}});
  const authCookies=cookies.map(c=>({name:c.name,value:c.value,url:base,httpOnly:false,sameSite:'Lax'}));
  await context.addCookies(authCookies);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const dialogs=[];
  page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
  await page.goto(`${base}/reader/${paperId}`);
  await page.locator('.paper-html').waitFor();
  await page.evaluate(()=>{window.scrollTo(0,100);window.dispatchEvent(new Event('scroll'));});
  await page.getByRole('link',{name:'Back to paper details'}).click();
  await page.waitForURL(/\/paper\//);
  assert.equal(dialogs.length,0);
  console.log('PASS: ordinary scroll does not prompt on navigation');
  await page.goto(`${base}/reader/${paperId}`);
  await page.locator('.paper-html').waitFor();
  let failedMark=false;
  await page.route(`**/reader/${paperId}`,async route=>{
    if(!failedMark && route.request().method()==='POST'){failedMark=true;await route.abort('failed');}
    else await route.continue();
  });
  await page.getByRole('button',{name:'I finished here'}).click();
  await page.getByRole('alert').filter({hasText:/Couldn’t save/}).waitFor();
  assert.equal(await page.locator('[data-testid="read-mark"]').getAttribute('data-save-state'),'unsaved');
  assert.match(await page.getByRole('button',{name:/Clear mark/}).innerText(),/unsaved/);
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.getByRole('status').filter({hasText:/^Saved$/}).first().waitFor();
  await page.unroute(`**/reader/${paperId}`);
  console.log('PASS: failed mark is visibly unsaved until retry is acknowledged');
  const progress=check(await db.from('reading_progress').select('*').eq('user_id',userId).eq('paper_id',paperId).single());
  assert(progress.marked_pct>0);
  console.log('PASS: acknowledged HTML progress persisted in local Supabase');

  await page.evaluate(()=>{const p=document.querySelector('[data-blk="0"]');const r=document.createRange();r.setStart(p.firstChild,10);r.setEnd(p.firstChild,16);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  await page.getByRole('button',{name:'Highlight',exact:true}).waitFor();
  // Let creation commit, but discard its network acknowledgement. Retry must
  // recover the same UUID, not create a second annotation.
  let dropped=false;
  await page.route(`**/reader/${paperId}`,async route=>{
    if(!dropped && route.request().method()==='POST'){
      dropped=true;
      try { await route.fetch(); await route.abort('failed'); } catch { /* page teardown */ }
    } else await route.continue();
  });
  await page.getByRole('button',{name:'Highlight',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/Couldn’t save/}).waitFor();
  assert.equal(check(await db.from('highlights').select('*').eq('user_id',userId)).length,1, 'Creation should commit before the response is discarded');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.locator('mark.pd-highlight').waitFor();
  assert.equal(check(await db.from('highlights').select('*').eq('user_id',userId)).length,1);
  console.log('PASS: lost creation response + retry leaves exactly one highlight');
  await page.unroute(`**/reader/${paperId}`);

  // Cancel must delete an uncertain committed creation before a different,
  // overlapping passage can be selected in that block.
  await page.evaluate(()=>{const p=document.querySelector('[data-blk="1"]');const r=document.createRange();r.setStart(p.firstChild,0);r.setEnd(p.firstChild,5);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  let droppedCancel=false;
  await page.route(`**/reader/${paperId}`,async route=>{
    if(!droppedCancel && route.request().method()==='POST'){
      droppedCancel=true;
      try { await route.fetch(); await route.abort('failed'); } catch { /* page teardown */ }
    } else await route.continue();
  });
  await page.getByRole('button',{name:'Highlight',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/Couldn’t save/}).waitFor();
  assert.equal(check(await db.from('highlights').select('id').eq('user_id',userId)).length,2);
  await page.unroute(`**/reader/${paperId}`);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Highlight',exact:true}).waitFor({state:'hidden'});
  assert.equal(check(await db.from('highlights').select('id').eq('user_id',userId)).length,1);
  await page.evaluate(()=>{const p=document.querySelector('[data-blk="1"]');const r=document.createRange();r.setStart(p.firstChild,0);r.setEnd(p.firstChild,8);const s=window.getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  await page.getByRole('button',{name:'Highlight',exact:true}).waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  console.log('PASS: Cancel removes an uncertain creation and frees overlapping selection');

  await page.locator('mark.pd-highlight').click();
  await page.getByRole('textbox',{name:'Note'}).fill('Persistent research note');
  let failedNote=false;
  await page.route(`**/reader/${paperId}`,async route=>{
    if(!failedNote && route.request().method()==='POST'){failedNote=true;await new Promise(resolve=>setTimeout(resolve,700));await route.abort('failed');}
    else await route.continue();
  });
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('status').filter({hasText:/Saving/}).waitFor();
  assert(await page.getByRole('button',{name:'Save',exact:true}).isDisabled());
  await page.getByRole('alert').filter({hasText:/Couldn’t save/}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Note'}).inputValue(),'Persistent research note');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.getByRole('textbox',{name:'Note'}).waitFor({state:'hidden'});
  assert.equal(check(await db.from('highlights').select('note').eq('user_id',userId).single()).note,'Persistent research note');
  console.log('PASS: note failure retains draft; retry persists it');
  await page.unroute(`**/reader/${paperId}`);

  const second=await browser.newContext({viewport:{width:390,height:844}});
  await second.addCookies(authCookies);
  const phone=await second.newPage();
  await phone.goto(`${base}/reader/${paperId}`);
  await phone.locator('mark.pd-highlight').waitFor();
  assert(await phone.locator('[data-testid="read-mark"]').count()===1);
  await phone.locator('mark.pd-highlight').click();
  assert.equal(await phone.getByRole('textbox',{name:'Note'}).inputValue(),'Persistent research note');
  await phone.getByRole('button',{name:'Cancel',exact:true}).click();
  await phone.reload();
  await phone.locator('mark.pd-highlight').waitFor();
  await phone.screenshot({path:join(tmpdir(),'paperdeck-saved-mobile.png')});
  console.log('PASS: reload and a second mobile browser context restore mark and note');

  await page.locator('mark.pd-highlight').click();
  let failedDelete=false;
  await page.route(`**/reader/${paperId}`,async route=>{
    if(!failedDelete && route.request().method()==='POST'){failedDelete=true;await route.abort('failed');}
    else await route.continue();
  });
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await page.getByRole('alert').filter({hasText:/Couldn’t save/}).waitFor();
  assert.equal(await page.locator('mark.pd-highlight').count(),1);
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.locator('mark.pd-highlight').waitFor({state:'hidden'});
  assert.equal(check(await db.from('highlights').select('id').eq('user_id',userId)).length,0);
  console.log('PASS: failed deletion retains highlight until retry succeeds');
  assert.deepEqual(errors,[]);
  console.log('PASS: no uncaught browser errors');
})().catch(e=>{console.error(e.message.split('Call log:')[0]);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  for(const table of ['paper_content','reading_progress','highlights']){
    check(await db.from(table).delete().eq('paper_id',paperId));
  }
  check(await db.from('papers').delete().eq('id',paperId));
  if(userId)check(await db.auth.admin.deleteUser(userId));
});
