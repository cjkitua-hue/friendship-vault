const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- IndexedDB helper (Blobs + JSON) ----------
const DB_NAME = "friendship_vault_db";
const DB_VERSION = 1;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if(!db.objectStoreNames.contains("media")) db.createObjectStore("media");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key, value){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function kvGet(key){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Media store ----------
async function mediaPut(blob){
  const id = crypto.randomUUID();
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readwrite");
    tx.objectStore("media").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

async function mediaGet(id){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readonly");
    const req = tx.objectStore("media").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function mediaGetAllKeys(){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readonly");
    const store = tx.objectStore("media");
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(tx.error);
  });
}

// ---------- Media metadata ----------
const MEDIA_META_PREFIX = "fv_media_meta_v1:";
function mediaMetaKey(id){ return MEDIA_META_PREFIX + id; }

function kindFromMime(mime){
  if(!mime) return "file";
  if(mime.startsWith("image/")) return "image";
  if(mime.startsWith("video/")) return "video";
  if(mime.startsWith("audio/")) return "audio";
  return "file";
}

async function mediaMetaSet(id, meta){
  await kvSet(mediaMetaKey(id), meta);
}

async function mediaMetaGet(id){
  return await kvGet(mediaMetaKey(id));
}

// ---------- Memories storage ----------
const STORAGE_KEY_MEMS = "fv_memories_v1";

async function getAllMemories(){
  const saved = (await kvGet(STORAGE_KEY_MEMS)) || [];
  // Combines your manual MEMORIES from data.js with the ones saved in the browser
  const staticMems = (typeof MEMORIES !== 'undefined') ? MEMORIES : [];
  return [...saved, ...staticMems];
}

async function saveMemories(savedMemories){
  await kvSet(STORAGE_KEY_MEMS, savedMemories);
}

// ---------- UI helpers ----------
function setActiveSection(id){
  $$(".section").forEach(s => s.classList.remove("active"));
  $$(".nav-btn").forEach(b => b.classList.remove("active"));
  $("#" + id)?.classList.add("active");
  $(`.nav-btn[data-section="${id}"]`)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uniqueTags(memories){
  const set = new Set();
  for(const m of memories){
    (m.tags || []).forEach(t => set.add(t));
  }
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}

async function renderTagOptions(){
  const sel = $("#tagSelect");
  if(!sel) return;
  sel.innerHTML = `<option value="">All tags</option>`;
  const all = await getAllMemories();
  const tags = uniqueTags(all);
  for(const t of tags){
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  }
}

function sortMemories(memories, dir){
  return [...memories].sort((a,b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    return dir === "asc" ? da - db : db - da;
  });
}

// ---------- Memories rendering ----------
async function filterMemories(){
  const q = ($("#searchInput")?.value || "").trim().toLowerCase();
  const tag = $("#tagSelect")?.value || "";
  const dir = $("#sortSelect")?.value || "desc";

  let list = await getAllMemories();

  // Logic: Hide future memories unless the date has passed
  const today = new Date().toISOString().split('T')[0];
  list = list.filter(m => {
     if(!m.unlockDate) return true;
     return m.unlockDate <= today;
  });

  if(tag) list = list.filter(m => (m.tags || []).includes(tag));
  if(q){
    list = list.filter(m => {
      const blob = `${m.title} ${m.story} ${(m.tags||[]).join(" ")}`.toLowerCase();
      return blob.includes(q);
    });
  }

  list = sortMemories(list, dir);
  renderMemories(list);
}

function renderMemories(memories){
  const wrap = $("#memoriesList");
  if(!wrap) return;
  wrap.innerHTML = "";

  if(memories.length === 0){
    wrap.innerHTML = `<div class="card"><div class="muted">No memories found yet.</div></div>`;
    return;
  }

  for(const m of memories){
    const el = document.createElement("article");
    el.className = "card mem-card";
    el.innerHTML = `
      <div class="top">
        <div>
          <h3 class="mem-title">${escapeHtml(m.title)}</h3>
          <div class="muted small">${escapeHtml(m.story)}</div>
        </div>
        <div class="mem-date">${escapeHtml(m.date)}</div>
      </div>
      <div class="tags">
        ${(m.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
    `;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => openMemoryModal(m));
    wrap.appendChild(el);
  }
}

// ---------- Modals ----------
function openModal({ kind, src, caption }){
  const img = $("#modalImg");
  const vid = $("#modalVideo");
  const cap = $("#modalCaption");

  if(img){ img.style.display = "none"; img.src = ""; }
  if(vid){ vid.style.display = "none"; vid.pause?.(); vid.src = ""; }
  if(cap) cap.textContent = caption || "";

  if(kind === "video"){
    if(vid){ vid.src = src; vid.style.display = "block"; }
  } else {
    if(img){ img.src = src; img.alt = caption || "Media"; img.style.display = "block"; }
  }
  $("#modal").classList.add("show");
  $("#modal").setAttribute("aria-hidden", "false");
}

function closeModal(){
  $("#modal").classList.remove("show");
  $("#modal").setAttribute("aria-hidden", "true");
  const img = $("#modalImg");
  const vid = $("#modalVideo");
  if(img){ img.src = ""; img.style.display = "none"; }
  if(vid){ vid.pause?.(); vid.src = ""; vid.style.display = "none"; }
}

async function openMemoryModal(m){
  const tagsHtml = (m.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  const mediaButtons = (m.media || []).map((x, i) => {
    const label = x.type?.startsWith("image/") ? `Photo ${i+1}` : x.type?.startsWith("video/") ? `Video ${i+1}` : `Media ${i+1}`;
    return `<button class="media-btn" data-media-id="${escapeHtml(x.id)}" data-media-type="${escapeHtml(x.type)}">${label}</button>`;
  }).join("");

  $("#modalCaption").innerHTML = `
    <div class="mem-modal-title">${escapeHtml(m.title)}</div>
    <div class="mem-modal-date">${escapeHtml(m.date)}</div>
    <div class="mem-modal-story" style="white-space: pre-wrap; margin: 15px 0;">${escapeHtml(m.story)}</div>
    <div class="mem-modal-tags">${tagsHtml}</div>
    ${mediaButtons ? `<div class="mem-modal-media">${mediaButtons}</div>` : ""}
    <div id="memMediaSlot" style="margin-top:14px;"></div>
  `;

  $("#modal").classList.add("show");
  $$("#modalCaption [data-media-id]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-media-id");
      const type = btn.getAttribute("data-media-type") || "";
      const blob = await mediaGet(id);
      if(!blob) return;
      const url = URL.createObjectURL(blob);
      const slot = $("#memMediaSlot");
      slot.innerHTML = type.startsWith("image/") ? `<img src="${url}" style="width:100%; border-radius:14px;"/>` : `<video src="${url}" controls style="width:100%; border-radius:14px;"></video>`;
    });
  });
}

// ---------- Initializers ----------
function initQuotes(){
  if(typeof QUOTES !== 'undefined' && QUOTES.length){
    $("#quoteText").textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
}

function initNav(){
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => setActiveSection(btn.dataset.section));
  });
}

function initAddMemoryToggle(){
  const body = $("#addMemoryBody");
  const btn = $("#toggleAddMemory");
  if(!body || !btn) return;
  body.classList.add("collapsed");
  btn.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    btn.querySelector(".small").textContent = body.classList.contains("collapsed") ? "tap to expand" : "tap to collapse";
  });
}

async function initAddMemory(){
  const btn = $("#addMemoryBtn");
  if(!btn) return;

  btn.addEventListener("click", async () => {
    const title = $("#newTitle").value.trim();
    const story = $("#newStory").value.trim();
    if(!title || !story) return alert("Title and story required");

    const media = [];
    const files = $("#newMedia")?.files;
    if(files){
      for(const f of files){
        const id = await mediaPut(f);
        media.push({ id, type: f.type, name: f.name });
        await mediaMetaSet(id, { id, kind: kindFromMime(f.type), mime: f.type, title: f.name, createdAt: Date.now(), source: "memory" });
      }
    }

    const newMem = {
      date: $("#newDate").value || new Date().toISOString().split('T')[0],
      title,
      story,
      tags: $("#newTags").value.split(",").map(s => s.trim()).filter(Boolean),
      unlockDate: $("#newUnlockDate")?.value || null,
      media
    };

    const saved = (await kvGet(STORAGE_KEY_MEMS)) || [];
    saved.unshift(newMem);
    await saveMemories(saved);

    // Reset UI
    $("#newTitle").value = ""; $("#newStory").value = ""; $("#newTags").value = "";
    if($("#newUnlockDate")) $("#newUnlockDate").value = "";
    
    await filterMemories();
    renderGallery();
    alert("Memory added!");
  });
}

function initHomeShortcuts() {
  const btnNew = $("#btnAddMemory");
  const btnLetter = $("#btnFutureLetter");
  const btnCapsule = $("#btnTimeCapsule");

  const setupForm = (title, isFuture) => {
    setActiveSection("memories");
    $("#addMemoryBody").classList.remove("collapsed");
    $("#newTitle").value = title;
    $("#unlockDateWrapper").style.display = isFuture ? "block" : "none";
    $("#addMemoryBody").scrollIntoView({ behavior: 'smooth' });
  };

  btnNew?.addEventListener("click", () => setupForm("", false));
  btnLetter?.addEventListener("click", () => setupForm("Letter to Future Self", true));
  btnCapsule?.addEventListener("click", () => setupForm("Time Capsule", true));
}

// ---------- Boot (The Brain) ----------
(async function boot(){
  initNav();
  initModal();
  initQuotes();
  initHomeShortcuts(); 
  initAddMemoryToggle();
  await initAddMemory();
  
  // Load data
  await renderTagOptions();
  await filterMemories();
  
  // Other features
  if(typeof initGalleryUI === 'function') initGalleryUI();
  if(typeof renderGallery === 'function') renderGallery();
  if(typeof initNotes === 'function') initNotes();

  setActiveSection("home");
})();
