
function humanTime(secs){
  secs = Math.floor(secs);
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = secs%60;
  if(h>0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function showStatus(msg, ok=true){
  const s = document.getElementById('status');
  s.textContent = msg;
  s.style.color = ok ? '#2b7a0b' : '#b30000';
  setTimeout(()=>{ s.textContent = ''; }, 2500);
}

async function getActiveYouTubeTab(){
  return new Promise((resolve)=>{
    chrome.tabs.query({active:true,currentWindow:true}, (tabs)=>{
      const tab = tabs && tabs[0];
      if(!tab) return resolve(null);
      if(!tab.url || !tab.url.includes('youtube.com/watch')) return resolve(null);
      resolve(tab);
    });
  });
}

async function saveCurrentTimestamp(){
  const tab = await getActiveYouTubeTab();
  if(!tab){ showStatus('Open a YouTube watch page first.', false); return; }

  // execute script in the page to fetch currentTime, videoId and title
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const video = document.querySelector('video');
      const urlParams = new URLSearchParams(location.search);
      const vid = urlParams.get('v') || null;
      const titleEl = document.querySelector('h1.title') || document.querySelector('h1.ytd-video-primary-info-renderer') || document.querySelector('meta[name="title"]');
      const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('content') || '') : document.title;
      return { currentTime: video ? video.currentTime : null, videoId: vid, title };
    }
  }, (results)=>{
    if(!results || !results[0] || !results[0].result){
      showStatus('Failed to read video. Try clicking play once.', false);
      return;
    }
    const res = results[0].result;
    if(!res.videoId || res.currentTime===null){
      showStatus('Cannot detect video on this tab.', false);
      return;
    }
    const entry = {
      id: Date.now().toString(36),
      videoId: res.videoId,
      title: (res.title||'YouTube Video').trim(),
      time: Math.floor(res.currentTime),
      timeText: humanTime(res.currentTime),
      created: Date.now()
    };
    // save to storage
    chrome.storage.local.get({bookmarks:[]}, (data)=>{
      const bm = data.bookmarks;
      bm.unshift(entry);
      chrome.storage.local.set({bookmarks: bm}, ()=>{
        renderList();
        showStatus('Bookmark saved ✅');
      });
    });
  });
}

function openBookmark(entry){
  const url = `https://www.youtube.com/watch?v=${entry.videoId}&t=${entry.time}s&autoplay=1`;
  // find existing tab with same video
  chrome.tabs.query({url: `*://*.youtube.com/watch*v=${entry.videoId}*`}, (tabs)=>{
    if(tabs && tabs.length>0){
      const tab = tabs[0];
      chrome.tabs.update(tab.id, {active:true, url}, ()=>{ window.close(); });
    } else {
      chrome.tabs.create({url}, ()=>{ window.close(); });
    }
  });
}

function deleteBookmark(id){
  chrome.storage.local.get({bookmarks:[]}, (data)=>{
    const bm = data.bookmarks.filter(b=>b.id!==id);
    chrome.storage.local.set({bookmarks: bm}, renderList);
  });
}

function clearAll(){
  if(!confirm('Delete all bookmarks?')) return;
  chrome.storage.local.set({bookmarks:[]}, renderList);
}

function renderList(){
  chrome.storage.local.get({bookmarks:[]}, (data)=>{
    const list = document.getElementById('list');
    list.innerHTML = '';
    const bm = data.bookmarks || [];
    if(bm.length===0){
      const li = document.createElement('li'); li.className='item'; li.textContent='No bookmarks yet.'; list.appendChild(li); return;
    }
    bm.forEach(entry=>{
      const li = document.createElement('li'); li.className='item';
      const left = document.createElement('div'); left.className='left';
      const title = document.createElement('div'); title.className='title'; title.textContent = entry.title;
      const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${entry.timeText} — ${new Date(entry.created).toLocaleString()}`;
      left.appendChild(title); left.appendChild(meta);
      const actions = document.createElement('div'); actions.className='actions';
      const openBtn = document.createElement('div'); openBtn.className='icon'; openBtn.title='Open at timestamp'; openBtn.textContent='▶'; openBtn.onclick = ()=> openBookmark(entry);
      const delBtn = document.createElement('div'); delBtn.className='icon'; delBtn.title='Delete'; delBtn.textContent='✕'; delBtn.onclick = ()=> { deleteBookmark(entry.id); };
      actions.appendChild(openBtn); actions.appendChild(delBtn);
      li.appendChild(left); li.appendChild(actions);
      list.appendChild(li);
    });
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('saveBtn').addEventListener('click', saveCurrentTimestamp);
  document.getElementById('clearBtn').addEventListener('click', clearAll);
  renderList();
});
