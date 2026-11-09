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
async function stop(){const old=activePlayer;activePlayer=null;if(old){try{await old.destroy()}catch(e){console.warn('[FULLTOSS] Player cleanup:',e)}}const v=player.querySelector('video');if(v){v.pause();v.removeAttribute('src');v.load()}}
function msg(title,detail){player.innerHTML='<div class="player-message"><div class="player-icon">▶</div><b>'+esc(title)+'</b><span>'+esc(detail)+'</span></div>'}
async function play(m,serverList){
  await stop();
  const list=Array.isArray(serverList)?serverList:[serverList].filter(Boolean);
  if(!list.length){msg('No playable server URL','The match feed contains no HTTPS stream URL.');return}
  if(!window.shaka||!shaka.Player.isBrowserSupported()){msg('Unsupported browser','Use an updated Chrome, Edge or Firefox browser.');return}

  // One visible video element; try feed servers sequentially behind the same player.
  const video=document.createElement('video');
  video.controls=true;video.playsInline=true;video.autoplay=true;video.preload='auto';
  video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
  video.style.cssText='width:100%;height:100%;background:#000;object-fit:contain';
  player.replaceChildren(video);

  const failures=[];
  for(let i=0;i<list.length;i++){
    const s=list[i];
    let instance=null,timer=null,errorHandler=null,onReady=null,onVideoError=null;
    let readyResolve,readyReject;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
    const cleanup=()=>{
      if(timer)clearTimeout(timer);
      if(onReady){video.removeEventListener('loadeddata',onReady);video.removeEventListener('canplay',onReady)}
      if(onVideoError)video.removeEventListener('error',onVideoError);
      if(instance&&errorHandler)instance.removeEventListener('error',errorHandler);
    };
    try{
      video.poster='';
      video.pause();
      video.removeAttribute('src');
      video.load();
      onReady=()=>readyResolve();
      onVideoError=()=>{const e=video.error;readyReject(Error('Video decode/network error'+(e?' (code '+e.code+')':'')))};
      video.addEventListener('loadeddata',onReady,{once:true});
      video.addEventListener('canplay',onReady,{once:true});
      video.addEventListener('error',onVideoError,{once:true});
      timer=setTimeout(()=>readyReject(Error('No video data received within 18 seconds')),18000);

      instance=new shaka.Player();
      activePlayer=instance;
      errorHandler=e=>{
        const d=e&&e.detail;
        const nested=d&&Array.isArray(d.data)?d.data[0]:null;
        const nestedData=nested&&Array.isArray(nested.data)?nested.data:[];
        const nestedCause=nestedData[1];
        const causeText=nestedCause&&typeof nestedCause==='object'
          ?(nestedCause.message||nestedCause.name||'')
          :typeof nestedCause==='string'?nestedCause:'';
        const networkCode=nested&&nested.code;
        const labels={6007:'LICENSE_REQUEST_FAILED',6008:'LICENSE_RESPONSE_REJECTED',6001:'REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE',1002:'HTTP_ERROR',1001:'BAD_HTTP_STATUS',1003:'TIMEOUT'};
        let extra='';
        if(networkCode)extra+=' · network error '+networkCode+(labels[networkCode]?' ('+labels[networkCode]+')':'');
        if(causeText)extra+=' · '+causeText;
        if(d&&d.code===6007)extra+=' · provider license request failed; authorized license-server settings are required';
        console.error('[FULLTOSS WILLOW Shaka diagnostic]',{
          code:d&&d.code,codeName:labels[d&&d.code]||'UNKNOWN',
          category:d&&d.category,severity:d&&d.severity,
          nestedCode:networkCode,nestedCodeName:labels[networkCode]||'',
          cause:causeText||undefined
        });
        readyReject(Error('Shaka Error '+(d&&d.code?d.code:'unknown')+(labels[d&&d.code]?' ('+labels[d.code]+')':'')+extra));
      };
      instance.addEventListener('error',errorHandler);
      instance.configure({
        streaming:{
          bufferingGoal:20,
          rebufferingGoal:2,
          retryParameters:{maxAttempts:3,baseDelay:500,backoffFactor:2}
        },
        abr:{enabled:true}
      });
      await instance.attach(video);
      await instance.load(s.url);
      if(activePlayer!==instance)throw Error('Playback cancelled');
      await ready;
      cleanup();
      video.play().catch(()=>{});
      console.info('[FULLTOSS] Playing with server:',s.label);
      return;
    }catch(e){
      cleanup();
      console.warn('[FULLTOSS] Server failed:',s.label,e);
      failures.push(s.label+': '+(e&&e.message?e.message:'Playback failed'));
      if(instance){try{await instance.destroy()}catch(_){}}
      if(activePlayer===instance)activePlayer=null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }
  msg('No video received from available servers',failures.join(' · ')||'No available server returned playable video. DRM-protected streams require the provider’s authorized license configuration.');
}
async function open(m){selectedMatch=m;$('#playerTitle').textContent=m.title;$('#playerMeta').textContent=m.competition+' · '+m.status.toUpperCase();modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');const list=servers(m);if(m.status!=='live'){await stop();msg('Upcoming fixture','This match is not marked LIVE by the provider feed yet.');return}if(!list.length){await stop();msg('No playable server URL','The match feed has no HTTPS stream URL for this fixture.');return}await play(m,list);}
async function close(){await stop();modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}
document.addEventListener('click',e=>{const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===f));render();return}const c=e.target.closest('[data-open]');if(c){const rows=matches.filter(x=>filter==='all'||x.status===filter),m=rows[+c.dataset.open];if(m)open(m)}});$('#close').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});$('#refresh').onclick=load;$('#explore').onclick=()=>$('#matches').scrollIntoView({behavior:'smooth'});$('#year').textContent=new Date().getFullYear();$('#menu').onclick=()=>document.querySelector('nav').classList.toggle('show');load();setInterval(()=>{if(!document.hidden)load()},60000);
})();