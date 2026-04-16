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

// ---------- Media store (Blob only, so memory modal keeps working) ----------
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

// ---------- Media metadata (stored in kv) ----------
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
  return [...saved, ...(Array.isArray(MEMORIES) ? MEMORIES : [])];
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

  // reset, keep "All tags"
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

  // 1. STRICT LOCK CHECK: Hide future memories
  const today = new Date().toISOString().split('T')[0]; // Gets current date as YYYY-MM-DD
  list = list.filter(m => {
     // If it has no unlock date, it's a normal memory. Show it.
     if (!m.unlockDate) return true; 
     
     // If it DOES have an unlock date, only show it if today is past or equal to that date.
     return m.unlockDate <= today;
  });

  // 2. Filter by Tag
  if(tag){
    list = list.filter(m => (m.tags || []).includes(tag));
  }

  // 3. Filter by Search Query
  if(q){
    list = list.filter(m => {
      const blob = `${m.title} ${m.story} ${(m.tags||[]).join(" ")}`.toLowerCase();
      return blob.includes(q);
    });
  }

  // 4. Sort and Render
  list = sortMemories(list, dir);
  renderMemories(list);
}

  list = sortMemories(list, dir);
  renderMemories(list);
}

function renderMemories(memories){
  const wrap = $("#memoriesList");
  if(!wrap) return;

  wrap.innerHTML = "";

  if(memories.length === 0){
    wrap.innerHTML = `<div class="card"><div class="muted">No matches. Try a different search/tag.</div></div>`;
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

// ---------- Modal (supports image + video) ----------
function openModal({ kind, src, caption }){
  const img = $("#modalImg");
  const vid = $("#modalVideo");
  const cap = $("#modalCaption");

  if(img){ img.style.display = "none"; img.src = ""; }
  if(vid){ vid.style.display = "none"; vid.pause?.(); vid.src = ""; }
  if(cap) cap.textContent = caption || "";

  if(kind === "video"){
    if(vid){
      vid.src = src;
      vid.style.display = "block";
    }
  } else {
    if(img){
      img.src = src;
      img.alt = caption || "Media";
      img.style.display = "block";
    }
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

  $("#modalCaption").textContent = "";
}

// ---------- Memory modal (media buttons) ----------
async function openMemoryModal(m){
  // Start with no image shown until user picks media
  const modalImg = $("#modalImg");
  if(modalImg){
    modalImg.src = "";
    modalImg.style.display = "none";
  }
  const modalVid = $("#modalVideo");
  if(modalVid){
    modalVid.pause?.();
    modalVid.src = "";
    modalVid.style.display = "none";
  }

  const tagsHtml = (m.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");

  const mediaButtons = (m.media || []).map((x, i) => {
    const label =
      x.type?.startsWith("image/") ? `Photo ${i+1}` :
      x.type?.startsWith("video/") ? `Video ${i+1}` :
      x.type?.startsWith("audio/") ? `Audio ${i+1}` :
      `Media ${i+1}`;

    return `<button class="media-btn" data-media-id="${escapeHtml(x.id)}" data-media-type="${escapeHtml(x.type)}">
      ${label}
    </button>`;
  }).join("");

  $("#modalCaption").innerHTML = `
    <div class="mem-modal-title">${escapeHtml(m.title)}</div>
    <div class="mem-modal-date">${escapeHtml(m.date)}</div>
    <div class="mem-modal-story">${escapeHtml(m.story)}</div>
    <div class="mem-modal-tags">${tagsHtml}</div>
    ${mediaButtons ? `<div class="mem-modal-media">${mediaButtons}</div>` : `<div class="muted small" style="margin-top:12px;">No media attached.</div>`}
    <div id="memMediaSlot" style="margin-top:14px;"></div>
  `;

  $("#modal").classList.add("show");
  $("#modal").setAttribute("aria-hidden", "false");

  $$("#modalCaption [data-media-id]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const id = btn.getAttribute("data-media-id");
      const type = btn.getAttribute("data-media-type") || "";
      const blob = await mediaGet(id);
      if(!blob) return;

      const url = URL.createObjectURL(blob);
      const slot = $("#memMediaSlot");

      // Clear previous
      if(slot) slot.innerHTML = "";
      if(modalImg){ modalImg.style.display = "none"; modalImg.src = ""; }
      if(modalVid){ modalVid.pause?.(); modalVid.style.display = "none"; modalVid.src = ""; }

      if(type.startsWith("image/")){
        if(modalImg){
          modalImg.src = url;
          modalImg.style.display = "block";
        }
      } else if(type.startsWith("video/")){
        // Prefer modalVideo if present
        if(modalVid){
          modalVid.src = url;
          modalVid.style.display = "block";
        } else if(slot){
          slot.innerHTML = `<video src="${url}" controls style="width:100%; border-radius:14px; max-height:60vh;"></video>`;
        }
      } else if(type.startsWith("audio/")){
        if(slot){
          slot.innerHTML = `<audio src="${url}" controls style="width:100%;"></audio>`;
        }
      } else {
        if(slot){
          slot.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Open file</a>`;
        }
      }
    });
  });
}

// ---------- Quotes ----------
function initQuotes(){
  if(!Array.isArray(QUOTES) || !QUOTES.length) return;
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $("#quoteText").textContent = q;
}

// ---------- Gallery (IndexedDB-backed) ----------
function initGalleryUI(){
  const addBtn = $("#galleryAddBtn");
  const fileInput = $("#galleryFileInput");
  const status = $("#galleryStatus");

  if(!addBtn || !fileInput) return;

  function setStatus(msg){
    if(!status) return;
    status.textContent = msg;
    setTimeout(()=> status.textContent = "", 1800);
  }

  addBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if(files.length === 0) return;

    let added = 0;

    for(const f of files){
      const kind = kindFromMime(f.type);
      if(kind !== "image" && kind !== "video") continue;

      const id = await mediaPut(f);

      await mediaMetaSet(id, {
        id,
        kind,
        mime: f.type,
        title: f.name,
        createdAt: Date.now(),
        tags: [],
        source: "standalone"
      });

      added++;
    }

    fileInput.value = "";
    setStatus(added ? `Added ${added} file(s).` : "No valid image/video selected.");
    renderGallery();
  });

  $("#gallerySearchInput")?.addEventListener("input", () => renderGallery());
  $("#galleryFilterSelect")?.addEventListener("change", () => renderGallery());
}

async function renderGallery(){
  const grid = $("#galleryGrid");
  if(!grid) return;
  grid.innerHTML = "";

  const q = ($("#gallerySearchInput")?.value || "").trim().toLowerCase();
  const filter = ($("#galleryFilterSelect")?.value || "all");

  const keys = await mediaGetAllKeys();

  const items = [];
  for(const id of keys){
    const meta = await mediaMetaGet(id);
    if(!meta) continue;

    const kind = meta.kind || kindFromMime(meta.mime || "");
    if(kind !== "image" && kind !== "video") continue;

    if(filter === "fromMemories" && meta.source !== "memory") continue;
    if(filter === "standalone" && meta.source !== "standalone") continue;

    if(q){
      const blob = `${meta.title || ""} ${(meta.tags||[]).join(" ")}`.toLowerCase();
      if(!blob.includes(q)) continue;
    }

    items.push({ id, meta, kind });
  }

  items.sort((a,b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));

  if(items.length === 0){
    grid.innerHTML = `<div class="card"><div class="muted">
      No gallery media yet. Use <b>+ Add photos/videos</b> or attach media to a memory.
    </div></div>`;
    return;
  }

  for(const it of items){
    const blob = await mediaGet(it.id);
    if(!blob) continue;

    const url = URL.createObjectURL(blob);
    const caption = it.meta.title || "";

    const box = document.createElement("div");
    box.className = "thumb";

    if(it.kind === "video"){
      box.innerHTML = `
        <video src="${url}" preload="metadata" muted></video>
        <div class="cap">${escapeHtml(caption)}</div>
      `;
      box.addEventListener("click", () => openModal({ kind: "video", src: url, caption }));
    } else {
      box.innerHTML = `
        <img src="${url}" alt="${escapeHtml(caption || "Photo")}" loading="lazy" />
        <div class="cap">${escapeHtml(caption)}</div>
      `;
      box.addEventListener("click", () => openModal({ kind: "image", src: url, caption }));
    }

    grid.appendChild(box);
  }
}

// ---------- Audio (IndexedDB-backed) ----------
async function renderAudioList(){
  const list = $("#audioList");
  if(!list) return;

  const q = ($("#audioSearchInput")?.value || "").trim().toLowerCase();

  const keys = await mediaGetAllKeys();

  const items = [];
  for(const id of keys){
    const meta = await mediaMetaGet(id);
    if(!meta) continue;

    const kind = meta.kind || kindFromMime(meta.mime || "");
    if(kind !== "audio") continue;

    if(q){
      const blob = `${meta.title || ""} ${(meta.tags||[]).join(" ")}`.toLowerCase();
      if(!blob.includes(q)) continue;
    }

    items.push({ id, meta });
  }

  items.sort((a,b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));

  if(items.length === 0){
    list.innerHTML = `<div class="card"><div class="muted">No audio yet. Use <b>+ Add audio</b>.</div></div>`;
    return;
  }

  list.innerHTML = "";

  for(const it of items){
    const row = document.createElement("div");
    row.className = "card";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "12px";

    row.innerHTML = `
      <div>
        <div style="font-weight:800;">${escapeHtml(it.meta.title || "Audio")}</div>
        <div class="muted small">${new Date(it.meta.createdAt || Date.now()).toISOString().slice(0,10)}</div>
      </div>
      <button class="ghost" type="button" data-play="${escapeHtml(it.id)}">Play</button>
    `;

    row.querySelector("[data-play]").addEventListener("click", async () => {
      const blob = await mediaGet(it.id);
      if(!blob) return;
      const url = URL.createObjectURL(blob);
      const player = $("#audioPlayer");
      player.src = url;
      player.play?.();
    });

    list.appendChild(row);
  }
}

function initAudioUI(){
  const addBtn = $("#audioAddBtn");
  const fileInput = $("#audioFileInput");
  const status = $("#audioStatus");

  if(!addBtn || !fileInput) return;

  function setStatus(msg){
    if(!status) return;
    status.textContent = msg;
    setTimeout(()=> status.textContent = "", 1800);
  }

  addBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if(files.length === 0) return;

    let added = 0;

    for(const f of files){
      const kind = kindFromMime(f.type);
      if(kind !== "audio") continue;

      const id = await mediaPut(f);

      await mediaMetaSet(id, {
        id,
        kind: "audio",
        mime: f.type,
        title: f.name,
        createdAt: Date.now(),
        tags: [],
        source: "standalone"
      });

      added++;
    }

    fileInput.value = "";
    setStatus(added ? `Added ${added} audio file(s).` : "No valid audio selected.");
    renderAudioList();
  });

  $("#audioSearchInput")?.addEventListener("input", () => renderAudioList());
}

// ---------- Notes (your existing code kept as-is) ----------
function initNotes(){
  const PAGES_KEY = "fv_notes_pages_v1";
  const CURRENT_KEY = "fv_notes_current_page_v1";

  const box = $("#notesBox");
  const saveBtn = $("#saveNotesBtn");
  const clearBtn = $("#clearNotesBtn");
  const editBtn = $("#editNotesBtn");

  const pageSelect = $("#notesPageSelect");
  const newBtn = $("#notesNewBtn");
  const renameBtn = $("#notesRenameBtn");
  const deleteBtn = $("#notesDeleteBtn");
  const indexBtn = $("#notesIndexBtn");
  const searchInput = $("#notesSearch");
  const tagInput = $("#notesTagInput");
  const tagList = $("#notesTagList");
  const indexPanel = $("#notesIndexPanel");

  if(!box || !pageSelect) return;

  const nowISO = () => new Date().toISOString();

  function loadPages(){
    try{ return JSON.parse(localStorage.getItem(PAGES_KEY) || "[]"); }
    catch{ return []; }
  }

  function savePages(pages){
    localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  }

  function getCurrentId(){
    return localStorage.getItem(CURRENT_KEY) || "";
  }

  function setCurrentId(id){
    localStorage.setItem(CURRENT_KEY, id);
  }

  function makePage(){
    const id = crypto.randomUUID();
    const d = new Date();
    const title = `Untitled — ${d.toISOString().slice(0,10)}`;
    return { id, title, createdAt: nowISO(), updatedAt: nowISO(), tags: [], content: "", savedOnce: false };
  }

  function ensureStarterPage(pages){
    if(pages.length) return pages;
    const p = makePage();
    pages.push(p);
    savePages(pages);
    setCurrentId(p.id);
    return pages;
  }

  function currentPage(pages){
    const id = getCurrentId();
    return pages.find(p => p.id === id) || pages[0];
  }

  function setReadOnly(isReadOnly){
    box.readOnly = isReadOnly;
    if(editBtn) editBtn.textContent = isReadOnly ? "Edit" : "Lock";
    if(saveBtn) saveBtn.disabled = isReadOnly;
    if(clearBtn) clearBtn.disabled = isReadOnly;
    if(tagInput) tagInput.disabled = isReadOnly;
  }

  function updateEditVisibility(p){
    if(!editBtn) return;
    editBtn.style.display = p.savedOnce ? "inline-block" : "none";
  }

  function renderSelect(pages){
    const cur = currentPage(pages);
    pageSelect.innerHTML = pages
      .map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`)
      .join("");
    pageSelect.value = cur.id;
  }

  function renderTags(p){
    tagList.innerHTML = (p.tags || []).map(t => `
      <span class="notes-tag">
        ${escapeHtml(t)}
        <button type="button" data-tag="${escapeHtml(t)}" aria-label="Remove tag">×</button>
      </span>
    `).join("");

    $$("#notesTagList [data-tag]").forEach(btn => {
      btn.addEventListener("click", () => {
        if(box.readOnly) return;

        const tag = btn.getAttribute("data-tag");
        const pages = loadPages();
        const cur = currentPage(pages);

        cur.tags = (cur.tags || []).filter(x => x !== tag);
        cur.updatedAt = nowISO();
        savePages(pages);

        renderTags(cur);
      });
    });
  }

  function openPage(p, { forceReadOnly } = {}){
    box.value = p.content || "";
    renderTags(p);
    updateEditVisibility(p);

    if(forceReadOnly === true){
      setReadOnly(true);
    } else if(forceReadOnly === false){
      setReadOnly(false);
    } else {
      setReadOnly(p.savedOnce ? true : false);
    }
  }

  function saveNow({ markSavedOnce } = {}){
    const pages = loadPages();
    const p = currentPage(pages);

    p.content = box.value;
    p.updatedAt = nowISO();

    if(markSavedOnce) p.savedOnce = true;

    savePages(pages);
    updateEditVisibility(p);
  }

  function showIndex(pages, query=""){
    const q = (query || "").trim().toLowerCase();

    const filtered = pages.filter(p => {
      if(!q) return true;
      const inTitle = (p.title || "").toLowerCase().includes(q);
      const inTags  = (p.tags || []).some(t => (t || "").toLowerCase().includes(q));
      const inBody  = (p.content || "").toLowerCase().includes(q);
      return inTitle || inTags || inBody;
    });

    indexPanel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <div style="font-weight:800; color:rgba(0,0,0,.72);">Index</div>
        <button type="button" class="ghost" id="closeIndexBtn">Close</button>
      </div>

      <div style="margin-top:12px;">
        ${filtered.map(p => `
          <div class="index-row" data-open-page="${p.id}">
            <div class="index-row-title">${escapeHtml(p.title)}</div>
            <div class="index-row-date">${escapeHtml((p.updatedAt || p.createdAt || "").slice(0,10))}</div>
          </div>
        `).join("") || `<div class="muted small">No pages found.</div>`}
      </div>
    `;

    indexPanel.style.display = "block";

    $("#closeIndexBtn")?.addEventListener("click", () => {
      indexPanel.style.display = "none";
    });

    $$("#notesIndexPanel [data-open-page]").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-open-page");
        setCurrentId(id);

        indexPanel.style.display = "none";

        const latest = ensureStarterPage(loadPages());
        renderSelect(latest);
        const p = currentPage(latest);

        openPage(p, { forceReadOnly: p.savedOnce ? true : false });
      });
    });
  }

  // ----- init state -----
  let pages = ensureStarterPage(loadPages());
  const cur = currentPage(pages);
  setCurrentId(cur.id);
  renderSelect(pages);
  openPage(cur);

  // ----- events -----
  pageSelect.addEventListener("change", () => {
    if(!box.readOnly){
      saveNow();
    }
    setCurrentId(pageSelect.value);
    pages = ensureStarterPage(loadPages());
    const p = currentPage(pages);
    openPage(p, { forceReadOnly: p.savedOnce ? true : false });
  });

  let debounce = null;
  box.addEventListener("input", () => {
    if(box.readOnly) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => saveNow(), 350);
  });

  saveBtn?.addEventListener("click", () => {
    const pages = loadPages();
    const p = currentPage(pages);
    saveNow({ markSavedOnce: true });
    updateEditVisibility(p);
  });

  clearBtn?.addEventListener("click", () => {
    if(box.readOnly) return;

    const pages = loadPages();
    const p = currentPage(pages);
    p.content = "";
    p.updatedAt = nowISO();
    savePages(pages);

    box.value = "";
  });

  newBtn.addEventListener("click", () => {
    const pages = loadPages();
    const p = makePage();

    pages.unshift(p);
    savePages(pages);
    setCurrentId(p.id);

    renderSelect(pages);
    openPage(p, { forceReadOnly: false });

    box.focus();
  });

  renameBtn.addEventListener("click", () => {
    const pages = loadPages();
    const p = currentPage(pages);

    const name = prompt("Rename this page:", p.title);
    if(!name) return;

    p.title = name.trim();
    p.updatedAt = nowISO();
    savePages(pages);

    renderSelect(pages);
  });

  deleteBtn.addEventListener("click", () => {
    const pages = loadPages();
    const p = currentPage(pages);

    const ok = confirm(`Delete "${p.title}"? This cannot be undone.`);
    if(!ok) return;

    const left = pages.filter(x => x.id !== p.id);
    const ensured = ensureStarterPage(left);

    savePages(ensured);
    setCurrentId(ensured[0].id);

    renderSelect(ensured);
    openPage(ensured[0]);
  });

  editBtn?.addEventListener("click", () => {
    setReadOnly(!box.readOnly);
    if(!box.readOnly) box.focus();
  });

  tagInput.addEventListener("keydown", (e) => {
    if(e.key !== "Enter") return;
    e.preventDefault();
    if(box.readOnly) return;

    const t = tagInput.value.trim();
    if(!t) return;

    const pages = loadPages();
    const p = currentPage(pages);

    p.tags = Array.from(new Set([...(p.tags || []), t]));
    p.updatedAt = nowISO();
    savePages(pages);

    tagInput.value = "";
    renderTags(p);
  });

  searchInput.addEventListener("input", () => {
    const pages = ensureStarterPage(loadPages());
    showIndex(pages, searchInput.value);
  });

  indexBtn.addEventListener("click", () => {
    const pages = ensureStarterPage(loadPages());
    showIndex(pages, searchInput.value);
  });
}

// ---------- Add memory (stores blobs + meta so gallery/audio can list) ----------
async function initAddMemory(){
  const status = $("#addStatus");
  const btn = $("#addMemoryBtn");
  if(!btn) return;

  function setStatus(msg){
    if(!status) return;
    status.textContent = msg;
    setTimeout(() => (status.textContent = ""), 1600);
  }

  btn.addEventListener("click", async () => {
    const date = ($("#newDate").value || "").trim() || new Date().toISOString().slice(0,10);
    const title = ($("#newTitle").value || "").trim();
    const story = ($("#newStory").value || "").trim();
    const tags = ($("#newTags").value || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if(!title || !story){
      setStatus("Title and story are required.");
      return;
    }

    const files = $("#newMedia")?.files;
    const media = [];

    if(files && files.length){
      for(const f of files){
        const id = await mediaPut(f);
        media.push({ id, type: f.type, name: f.name });

        // IMPORTANT: write meta so Gallery/Audio can list this attachment
        const kind = kindFromMime(f.type);
        await mediaMetaSet(id, {
          id,
          kind,
          mime: f.type,
          title: f.name,
          createdAt: Date.now(),
          tags: [],
          source: "memory"
        });
      }
    }

    const newMem = { date, title, story, tags, media };

    const saved = (await kvGet(STORAGE_KEY_MEMS)) || [];
    saved.unshift(newMem);
    await saveMemories(saved);

    $("#newTitle").value = "";
    $("#newStory").value = "";
    $("#newTags").value = "";
    if($("#newMedia")) $("#newMedia").value = "";

    setStatus("Added.");
    await renderTagOptions();
    await filterMemories();

    // refresh Gallery/Audio because memory attachments should appear there
    renderGallery();
    renderAudioList();
  });
}

// ---------- Backup ----------
async function initBackup(){
  $("#exportBtn")?.addEventListener("click", async () => {
    const saved = (await kvGet(STORAGE_KEY_MEMS)) || [];
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "friendship-vault-backup.json";
    a.click();

    URL.revokeObjectURL(url);
  });

  $("#importBtn")?.addEventListener("click", async () => {
    const file = $("#importFile")?.files?.[0];
    if(!file) return;

    const text = await file.text();
    const data = JSON.parse(text);
    if(!Array.isArray(data)) throw new Error("Invalid backup format.");

    await saveMemories(data);
    await renderTagOptions();
    await filterMemories();
    alert("Imported successfully.");

    // refresh other views
    renderGallery();
    renderAudioList();
  });
}

// ---------- Nav / Filters / Modal ----------
function initNav(){
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => setActiveSection(btn.dataset.section));
  });

  $("#scrollToMemoriesBtn")?.addEventListener("click", () => setActiveSection("memories"));

  $("#randomMemoryBtn")?.addEventListener("click", async () => {
    const all = await getAllMemories();
    if(!all.length) return;
    const m = all[Math.floor(Math.random() * all.length)];
    setActiveSection("memories");
    $("#searchInput").value = m.title;
    filterMemories();
  });
}

function initAddMemoryToggle(){
  const body = $("#addMemoryBody");
  const btn = $("#toggleAddMemory");
  if(!body || !btn) return;

  body.classList.add("collapsed");

  btn.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    btn.querySelector(".small").textContent = body.classList.contains("collapsed")
      ? "tap to expand"
      : "tap to collapse";
  });
}

function initFilters(){
  $("#searchInput")?.addEventListener("input", filterMemories);
  $("#tagSelect")?.addEventListener("change", filterMemories);
  $("#sortSelect")?.addEventListener("change", filterMemories);
}

function initModal(){
  $("#closeModal")?.addEventListener("click", closeModal);
  $("#modal")?.addEventListener("click", (e) => {
    if(e.target.id === "modal") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape") closeModal();
  });
}
// ---------- Home Page Shortcuts ----------
function initHomeShortcuts() {
  const btnNew = $("#btnAddMemory");
  const btnLetter = $("#btnFutureLetter");
  const btnCapsule = $("#btnTimeCapsule");

  const setupMemoriesForm = (titleText, isFutureItem) => {
    // 1. Switch to the Memories tab
    setActiveSection("memories");

    // 2. Uncollapse the form
    const formBody = $("#addMemoryBody");
    if (formBody) {
      formBody.classList.remove("collapsed");
      const toggleBtnText = $("#toggleAddMemory .small");
      if (toggleBtnText) toggleBtnText.textContent = "tap to collapse";
    }

    // 3. Set the Title automatically
    const titleInput = $("#newTitle");
    if (titleInput) titleInput.value = titleText;

    // 4. Show/Hide Unlock Date logic
    const unlockWrapper = $("#unlockDateWrapper");
    if (unlockWrapper) {
      unlockWrapper.style.display = isFutureItem ? "block" : "none";
      if (!isFutureItem && $("#newUnlockDate")) $("#newUnlockDate").value = "";
    }

    // 5. Scroll to form smoothly
    formBody?.scrollIntoView({ behavior: 'smooth' });
  };

  // Add click listeners
  btnNew?.addEventListener("click", () => setupMemoriesForm("", false));
  btnLetter?.addEventListener("click", () => setupMemoriesForm("Letter to Future Self", true));
  btnCapsule?.addEventListener("click", () => setupMemoriesForm("Time Capsule", true));
}

// ---------- Boot ----------
(async function boot(){
  initNav();
  initModal();
  initQuotes();
  
  initHomeShortcuts();

  initFilters();
  await renderTagOptions();
  await filterMemories();

  initGalleryUI();
  await renderGallery();

  initAudioUI();
  await renderAudioList();

  initNotes();
  await initAddMemory();
  await initBackup();
  initAddMemoryToggle();

  setActiveSection("home");
})();
