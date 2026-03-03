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

const STORAGE_KEY_MEMS = "fv_memories_v1";

async function getAllMemories(){
  const saved = (await kvGet(STORAGE_KEY_MEMS)) || [];
  return [...saved, ...(Array.isArray(MEMORIES) ? MEMORIES : [])];
}

async function saveMemories(savedMemories){
  await kvSet(STORAGE_KEY_MEMS, savedMemories);
}

function setActiveSection(id){
  $$(".section").forEach(s => s.classList.remove("active"));
  $$(".nav-btn").forEach(b => b.classList.remove("active"));
  $("#" + id).classList.add("active");
  $(`.nav-btn[data-section="${id}"]`).classList.add("active");
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

function renderTagOptions(){
  const tags = uniqueTags(MEMORIES);
  const sel = $("#tagSelect");
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

async function filterMemories(){
  const q = ($("#searchInput").value || "").trim().toLowerCase();
  const tag = $("#tagSelect").value;
  const dir = $("#sortSelect").value;

  let list = await getAllMemories();

  if(tag){
    list = list.filter(m => (m.tags || []).includes(tag));
  }
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

function renderGallery(){
  const grid = $("#galleryGrid");
  grid.innerHTML = "";

  if(!PHOTOS || PHOTOS.length === 0){
    grid.innerHTML = `<div class="card"><div class="muted">Add photos in <span class="pill">assets/photos/</span> then list them in <span class="pill">data.js</span>.</div></div>`;
    return;
  }

  for(const p of PHOTOS){
    const box = document.createElement("div");
    box.className = "thumb";
    box.innerHTML = `
      <img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.caption || "Photo")}" loading="lazy" />
      <div class="cap">${escapeHtml(p.caption || "")}</div>
    `;
    box.addEventListener("click", () => openModal(p.src, p.caption || ""));
    grid.appendChild(box);
  }
}

function openModal(src, caption){
  $("#modalImg").src = src;
  $("#modalImg").alt = caption || "Photo";
  $("#modalCaption").textContent = caption || "";
  $("#modal").classList.add("show");
  $("#modal").setAttribute("aria-hidden", "false");
}

function closeModal(){
  $("#modal").classList.remove("show");
  $("#modal").setAttribute("aria-hidden", "true");
  $("#modalImg").src = "";
  $("#modalCaption").textContent = "";
}
async function openMemoryModal(m){
  // Start with no image shown until user picks media
  $("#modalImg").src = "";
  $("#modalImg").style.display = "none";

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

  // Put the whole memory into the caption area
  $("#modalCaption").innerHTML = `
    <div class="mem-modal-title">${escapeHtml(m.title)}</div>
    <div class="mem-modal-date">${escapeHtml(m.date)}</div>
    <div class="mem-modal-story">${escapeHtml(m.story)}</div>
    <div class="mem-modal-tags">${tagsHtml}</div>
    ${mediaButtons ? `<div class="mem-modal-media">${mediaButtons}</div>` : `<div class="muted small" style="margin-top:12px;">No media attached.</div>`}
    <div id="memMediaSlot" style="margin-top:14px;"></div>
  `;

  // Open modal (no photo yet)
  $("#modal").classList.add("show");
  $("#modal").setAttribute("aria-hidden", "false");

  // Hook media buttons
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
      slot.innerHTML = "";
      $("#modalImg").style.display = "none";
      $("#modalImg").src = "";

      if(type.startsWith("image/")){
        $("#modalImg").src = url;
        $("#modalImg").style.display = "block";
      } else if(type.startsWith("video/")){
        slot.innerHTML = `<video src="${url}" controls style="width:100%; border-radius:14px; max-height:60vh;"></video>`;
      } else if(type.startsWith("audio/")){
        slot.innerHTML = `<audio src="${url}" controls style="width:100%;"></audio>`;
      } else {
        slot.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Open file</a>`;
      }
    });
  });
}

function initQuotes(){
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $("#quoteText").textContent = q;
}

function initAudio(){
  const player = $("#audioPlayer");
  if(AUDIO_FILE && AUDIO_FILE.trim()){
    player.src = AUDIO_FILE;
  } else {
    player.outerHTML = `<div class="muted">No audio set. Add a file in <span class="pill">assets/audio/</span> and update <span class="pill">AUDIO_FILE</span> in data.js.</div>`;
  }
}

function initNotes(){
  const key = "friendship_vault_notes_v1";
  const box = $("#notesBox");
  const status = $("#saveStatus");

  box.value = localStorage.getItem(key) || "";

  $("#saveNotesBtn").addEventListener("click", () => {
    localStorage.setItem(key, box.value);
    status.textContent = "Saved.";
    setTimeout(() => status.textContent = "", 1200);
  });

  $("#clearNotesBtn").addEventListener("click", () => {
    box.value = "";
    localStorage.removeItem(key);
    status.textContent = "Cleared.";
    setTimeout(() => status.textContent = "", 1200);
  });
}

async function initAddMemory(){
  const status = $("#addStatus");
  const btn = $("#addMemoryBtn");

  function setStatus(msg){
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

    const files = $("#newMedia").files;
    const media = [];
    if(files && files.length){
      for(const f of files){
        const id = await mediaPut(f);
        media.push({ id, type: f.type, name: f.name });
      }
    }

    const newMem = { date, title, story, tags, media };

    const saved = (await kvGet(STORAGE_KEY_MEMS)) || [];
    saved.unshift(newMem);
    await saveMemories(saved);

    $("#newTitle").value = "";
    $("#newStory").value = "";
    $("#newTags").value = "";
    $("#newMedia").value = "";

    setStatus("Added.");
    await filterMemories();
  });
}

async function initBackup(){
  $("#exportBtn").addEventListener("click", async () => {
    const saved = (await kvGet(STORAGE_KEY_MEMS)) || [];
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "friendship-vault-backup.json";
    a.click();

    URL.revokeObjectURL(url);
  });

  $("#importBtn").addEventListener("click", async () => {
    const file = $("#importFile").files?.[0];
    if(!file) return;

    const text = await file.text();
    const data = JSON.parse(text);
    if(!Array.isArray(data)) throw new Error("Invalid backup format.");

    await saveMemories(data);
    await filterMemories();
    alert("Imported successfully.");
  });
}

function initNav(){
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => setActiveSection(btn.dataset.section));
  });

  $("#scrollToMemoriesBtn").addEventListener("click", () => setActiveSection("memories"));

  $("#randomMemoryBtn").addEventListener("click", () => {
    if(!MEMORIES.length) return;
    const m = MEMORIES[Math.floor(Math.random() * MEMORIES.length)];
    setActiveSection("memories");
    // quick filter by title to “jump”
    $("#searchInput").value = m.title;
    filterMemories();
  });
}

function initAddMemoryToggle(){
  const body = document.querySelector("#addMemoryBody");
  const btn = document.querySelector("#toggleAddMemory");
  if(!body || !btn) return;

  // start collapsed
  body.classList.add("collapsed");

  btn.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    btn.querySelector(".small").textContent = body.classList.contains("collapsed")
      ? "tap to expand"
      : "tap to collapse";
  });
}

function initFilters(){
  $("#searchInput").addEventListener("input", filterMemories);
  $("#tagSelect").addEventListener("change", filterMemories);
  $("#sortSelect").addEventListener("change", filterMemories);
}

function initModal(){
  $("#closeModal").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => {
    if(e.target.id === "modal") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape") closeModal();
  });
}

// Boot
initNav();
initModal();
initQuotes();
renderTagOptions();
initFilters();
filterMemories();
renderGallery();
initAudio();
initNotes();
initAddMemory();
initBackup();
initAddMemoryToggle();

// Set default active nav
setActiveSection("home");