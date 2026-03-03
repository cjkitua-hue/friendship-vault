const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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

function filterMemories(){
  const q = ($("#searchInput").value || "").trim().toLowerCase();
  const tag = $("#tagSelect").value;
  const dir = $("#sortSelect").value;

  let list = MEMORIES;

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

// Set default active nav
setActiveSection("home");