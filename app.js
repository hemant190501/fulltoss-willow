(()=>{'use strict';
const FEEDS=['https://sonujson-v5.pages.dev/Data/willow.json','https://raw.githubusercontent.com/srhady/willow-event/main/live_sports.json'];
const $=s=>document.querySelector(s),grid=$('#grid'),modal=$('#modal'),player=$('#player');
let matches=[],filter='all',busy=false,activePlayer=null,selectedMatch=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick=(o,keys)=>{if(!o||typeof o!=='object')return'';const m={};Object.keys(o).forEach(k=>m[k.toLowerCase()]=o[k]);for(const k of keys){const v=m[k.toLowerCase()];if(v!==undefined&&v!==null&&v!=='')return v}return''};
function extract(raw){if(Array.isArray(raw))return raw;if(!raw||typeof raw!=='object')return[];for(const k of ['Matches','matches','events','data','results','list','items']){const v=raw[k];if(Array.isArray(v))return v;if(v&&typeof v==='object'){for(const n of ['Matches','matches','events','results','items'])if(Array.isArray(v[n]))return v[n]}}return[]}
function status(v){const s=String(v||'').toUpperCase();if(s==='LIVE'||/IN PLAY|INPLAY|STARTED/.test(s))return'live';if(/ENDED|FINISHED|COMPLETED|RESULT|CANCELLED|POSTPONED|ABANDONED/.test(s))return'ended';return'upcoming'}
function normalize(r,i){const title=String(pick(r,['event_name','title','name','event','match_name','match_title'])||'Cricket fixture');return{id:String(pick(r,['id','matchId','match_id','matchID','stream_id'])||title+'-'+i),title,competition:String(pick(r,['tournament','competition','series','league','sport','category'])||'WILLOW CRICKET'),image:String(pick(r,['image','cover_image','poster','thumbnail','cover'])||''),time:String(pick(r,['time','startTime','date','matchTime','start_time','start_date'])||''),status:status(pick(r,['status','matchStatus','state'])),raw:r}}
function date(v){if(!v)return'TIME TO BE ANNOUNCED';const d=new Date(v);return isNaN(d)?String(v):d.toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
function servers(m){const r=m?.raw||{},out=[],add=(obj,prefix)=>{if(!obj||typeof obj!=='object')return;Object.entries(obj).forEach(([k,v])=>{if(typeof v==='string'&&/^https:\/\//i.test(v))out.push({key:k,url:v,label:(prefix+' '+k).replace(/[_-]/g,' ').replace(/\b\w/g,x=>x.toUpperCase())});else if(v&&typeof v==='object')add(v,prefix+' '+k)})};add(r.CnpTV,'CnpTV');add(r.stream_url_alpha,'Alpha');add(r.stream_url_bravo,'Bravo');const seen=new Set();return out.filter(s=>{if(seen.has(s.url))return false;seen.add(s.url);return true})}
function render(){const rows=matches.filter(m=>filter==='all'||m.status===filter),live=matches.filter(m=>m.status==='live').length,up=matches.filter(m=>m.status==='upcoming').length;$('#allCount').textContent=matches.length;$('#liveCount').textContent=live;$('#upCount').textContent=up;$('#feedState').textContent=busy?'UPDATING MATCH FEED':matches.length?'MATCH FEED CONNECTED':'NO FIXTURES FOUND';grid.innerHTML=rows.length?rows.map((m,i)=>'<article class="match-card '+m.status+'" data-open="'+i+'"><div class="card-art">'+(m.image?'<img src="'+esc(m.image)+'" alt="" loading="lazy" onerror="this.remove()">':'')+'<div class="art-shade"></div><span class="competition">'+esc(m.competition)+'</span><span class="status '+m.status+'">'+(m.status==='live'?'<i></i> LIVE':m.status==='ended'?'COMPLETED':'UPCOMING')+'</span><div class="card-watermark">FT</div></div><div class="card-info"><div class="match-title">'+esc(m.title)+'</div><div class="match-meta"><span class="meta-icon">◷</span>'+esc(m.status==='live'?'LIVE NOW':date(m.time))+'</div><div class="card-action"><span>'+(m.status==='live'?'CHOOSE SERVER':m.status==='ended'?'MATCH COMPLETED':'UPCOMING FIXTURE')+'</span><b>↗</b></div></div></article>').join(''):'<div class="empty-state"><b>No fixtures found</b><span>Try another filter or refresh the match feed.</span><button id="emptyRefresh">REFRESH FEED ↻</button></div>';const b=$('#emptyRefresh');if(b)b.onclick=load}
async function load(){if(busy)return;busy=true;$('#feedState').textContent='UPDATING MATCH FEED';try{const results=await Promise.allSettled(FEEDS.map(async url=>{const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(url+' HTTP '+r.status);return extract(await r.json())}));const all=[];results.forEach(x=>{if(x.status==='fulfilled')all.push(...x.value)});if(!all.length)throw Error('All match feeds unavailable');const seen=new Set();matches=all.filter(x=>x&&typeof x==='object').map(normalize).filter(m=>{const k=m.id.toLowerCase();if(seen.has(k))return false;seen.add(k);return true});$('#updated').textContent='UPDATED '+new Date().toLocaleTimeString('en-IN')}catch(e){console.error('[FULLTOSS WILLOW feed]',e);$('#updated').textContent='LIVE FEED UNAVAILABLE — RETRYING';if(!matches.length)try{const r=await fetch('./data/matches.json');const d=await r.json();matches=(d.matches||[]).map(normalize)}catch(_){}}finally{busy=false;render()}}
async function stop(){
  if(activePlayer&&typeof activePlayer.destroy==='function'){try{await activePlayer.destroy()}catch(e){console.warn('[FULLTOSS] player cleanup',e)}}
  activePlayer=null;
  const old=player.querySelector('iframe');
  if(old){old.src='about:blank';old.remove()}
  player.innerHTML='';
}
function msg(title,detail){player.innerHTML='<div class="player-message"><div class="player-icon">▶</div><b>'+esc(title)+'</b><span>'+esc(detail)+'</span></div>'}
async function play(m,serverList){
  await stop();
  const list=Array.isArray(serverList)?serverList:[serverList].filter(Boolean);
  if(!list.length){msg('No playable server URL','The match feed contains no HTTPS URL for this fixture.');return}
  const first=list[0].url;
  // CENC streams require the provider's authorized DRM license configuration.
  // Do not attempt to use feed-supplied key material or bypass the license system.
  if(/\.mpd(?:[?#]|$)/i.test(first)&&(/cenc/i.test(first)||m.raw?.drm_key)){
    const names=list.map(s=>s.label).join(', ');
    msg('Provider DRM configuration required','This feed supplies an encrypted CENC/DASH stream. A compatible player alone cannot decrypt it. The provider must supply its authorized DRM license URL and configuration. Available mirror URLs: '+names+'.');
    console.info('[FULLTOSS] Encrypted DASH detected; waiting for authorized provider DRM configuration.');
    return;
  }
  const isManifest=u=>/\.(mpd|m3u8)(?:[?#]|$)/i.test(u);
  if(!isManifest(first)){
    const frame=document.createElement('iframe');
    frame.src=first;frame.title=m.title+' — '+list[0].label;
    frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;
    frame.referrerPolicy='no-referrer-when-downgrade';frame.loading='eager';
    frame.style.cssText='width:100%;height:100%;min-height:320px;border:0;background:#000;display:block';
    player.replaceChildren(frame);
    console.info('[FULLTOSS] Opening provider player page:',list[0].label,first);
    return;
  }
  if(!window.shaka||!window.shaka.Player){msg('Player library unavailable','Shaka Player did not load. Refresh the page and try again.');return}
  const video=document.createElement('video');
  video.controls=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');
  video.style.cssText='width:100%;height:100%;min-height:320px;max-height:75vh;display:block;background:#000;object-fit:contain';
  player.replaceChildren(video);
  window.shaka.polyfill.installAll();
  if(!window.shaka.Player.isBrowserSupported()){msg('Browser not supported','This browser does not support the required media playback features. Try an updated Chrome, Edge, Safari or Firefox.');return}
  const shakaPlayer=new window.shaka.Player();
  activePlayer=shakaPlayer;
  try{await shakaPlayer.attach(video)}catch(e){console.error('[FULLTOSS] Shaka attach failed',e);msg('Could not initialize player','The browser could not initialize the media player.');return}
  let lastError=null;
  for(let i=0;i<list.length;i++){
    const s=list[i];
    if(!isManifest(s.url))continue;
    try{
      console.info('[FULLTOSS] Loading manifest',i+1,s.label,s.url);
      await shakaPlayer.load(s.url);
      $('#playerMeta').textContent=m.competition+' · '+s.label.toUpperCase();
      video.play().catch(()=>{});
      return;
    }catch(e){lastError=e;console.warn('[FULLTOSS] Server failed:',s.label,e);try{await shakaPlayer.unload()}catch(_){}}
  }
  console.error('[FULLTOSS] All compatible manifest servers failed',lastError);
  await stop();
  msg('Stream could not be played','All available manifest mirrors failed. This may be due to encryption, expired URLs, CORS, or provider-side access restrictions. Check the browser console for the exact playback error.');
}
async function open(m){selectedMatch=m;$('#playerTitle').textContent=m.title;$('#playerMeta').textContent=m.competition+' · '+m.status.toUpperCase();modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');const list=servers(m);if(m.status!=='live'){await stop();msg('Upcoming fixture','This match is not marked LIVE by the provider feed yet.');return}if(!list.length){await stop();msg('No playable server URL','The match feed has no HTTPS stream URL for this fixture.');return}await play(m,list);}
async function close(){await stop();modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}
document.addEventListener('click',e=>{const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===f));render();return}const c=e.target.closest('[data-open]');if(c){const rows=matches.filter(x=>filter==='all'||x.status===filter),m=rows[+c.dataset.open];if(m)open(m)}});$('#close').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});$('#refresh').onclick=load;$('#explore').onclick=()=>$('#matches').scrollIntoView({behavior:'smooth'});$('#year').textContent=new Date().getFullYear();$('#menu').onclick=()=>document.querySelector('nav').classList.toggle('show');load();setInterval(()=>{if(!document.hidden)load()},60000);
})();