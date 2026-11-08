// PinBoard — Create Pin (+) workflow. Public shared pins via Supabase.
// Pins + boards live in the pesalink Supabase project (tables pins, boards).
// Anyone can view the feed; posting needs a real account (Supabase Auth).
// Local storage keeps only: offline pin cache ("pins-cache"), saved pin ids ("pinboard-saved"), notification pref.
const SUPABASE_URL = "https://baucxuimppcajcafdsqx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhdWN4dWltcHBjYWpjYWZkc3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMDU5MzMsImV4cCI6MjEwODg4MTkzM30.RFUIyH8tSGoQodpCEdijiisXJniUwsZYpmUF_KI-u9k";
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Discover: free photo keys (paste YOUR OWN keys here, nothing else) ----------
// Openverse needs NO key and works out of the box — the app runs fully on it.
// Unsplash (optional): make a free app at https://unsplash.com/developers
//   and paste its Access Key below. Leave it "" and Unsplash is simply skipped.
// Pixabay (optional): sign up at https://pixabay.com/api/docs/
//   and paste the key from your dashboard below. Leave it "" and Pixabay is skipped.
// NEVER paste a real key into a shared screenshot, and never commit a real key.
var UNSPLASH_ACCESS_KEY = "";
var PIXABAY_API_KEY = "";

function $(id) { return document.getElementById(id); }
// Pins/boards come from Supabase (see loadFeed). These helpers only handle the offline cache + saved ids.
function loadCache() { try { return JSON.parse(localStorage.getItem("pins-cache") || "[]"); } catch (e) { return []; } }
function saveCache() { try { localStorage.setItem("pins-cache", JSON.stringify(pins)); } catch (e) {} }
function loadSavedIds() { try { return new Set(JSON.parse(localStorage.getItem("pinboard-saved") || "[]")); } catch (e) { return new Set(); } }
function saveSavedIds() { localStorage.setItem("pinboard-saved", JSON.stringify(Array.from(savedIds))); }
function displayName(user) {
  if (!user) { return "PinBoard"; }
  return (user.user_metadata && user.user_metadata.display_name) || (user.email ? user.email.split("@")[0] : "PinBoard");
}
function dbToPin(r) {
  return { id: r.id, user_id: r.user_id || null, author_name: r.author_name || "PinBoard",
    title: r.title, description: r.description || "", link: r.link || "",
    category: r.category || "Other", topics: Array.isArray(r.topics) ? r.topics : [],
    boardId: r.board_id || null, board_private: !!r.board_private,
    image: r.image || "", media: Array.isArray(r.media) ? r.media : [],
    layout: r.layout || "single", product: r.product || null,
    commentsAllowed: r.comments_allowed !== false, saved: savedIds.has(r.id),
    createdAt: r.created_at || "" };
}
function pinToDb(p, user) {
  return { user_id: user.id, author_name: displayName(user), title: p.title,
    description: p.description, link: p.link, category: p.category, topics: p.topics,
    board_id: p.boardId, board_private: p.board_private, image: p.image, media: p.media,
    layout: p.layout, product: p.product, comments_allowed: p.commentsAllowed };
}
function uid() { return "id-" + Date.now() + "-" + Math.floor(Math.random() * 100000); }
function showToast(msg) { var t = $("toast"); t.textContent = msg; t.classList.remove("hidden"); setTimeout(function() { t.classList.add("hidden"); }, 2500); }
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

var pins = [];
var boards = [];
var savedIds = loadSavedIds();
var currentUser = null;
var currentSearch = "";
var currentCategory = "All";
var flowMode = "pin"; // pin | collage
var mediaItems = []; // {type, url, name, selected, editor:{aspect,rotation,text,position,color,size,filter,brightness,contrast,saturation}}
var pickerTab = "all";
var editorIndex = 0;
var selectedBoardId = null;
var selectedTopics = [];
var currentPinId = null;
var boardSheetMode = "select"; // select | create | change-board
var publishing = false;
var draftToRetry = null;
// Likes: pin id -> number of likes; myLikes = pin ids the logged-in user liked.
var likeCounts = {};
var myLikes = new Set();
// Discover: free-photo results from Openverse / Unsplash / Pixabay.
var discoverResults = [];
var discoverQuery = "rooms";
var discoverSource = "openverse";
var discoverFilling = false;
var discoverSearched = false;

function newEditor() { return { aspect: "original", rotation: 0, text: "", position: "center", color: "#ffffff", size: 24, filter: "none", brightness: 100, contrast: 100, saturation: 100 }; }
function selectedMedia() { return mediaItems.filter(function(m) { return m.selected; }); }
function boardById(id) { return boards.find(function(b) { return b.id === id; }) || null; }
function boardCount(id) { return pins.filter(function(p) { return p.boardId === id; }).length; }

function showView(viewId) {
  ["feed-view", "create-view", "pin-view", "auth-view", "profile-view", "search-view", "saved-view", "notifications-view", "discover-view"].forEach(function(id) { $(id).classList.toggle("active", id === viewId); });
  $("plus-button").classList.toggle("hidden", viewId === "auth-view");
  var nav = $("bottom-nav");
  if (nav) { nav.classList.toggle("hidden", viewId === "auth-view"); }
  document.querySelectorAll("#bottom-nav button[data-view]").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });
  closeSheets();
  window.scrollTo(0, 0);
  if (viewId === "search-view") { renderSearchGrid(); }
  if (viewId === "saved-view") { renderSavedGrid(); }
  if (viewId === "notifications-view") { renderActivity(); }
  if (viewId === "discover-view") { renderDiscover(); }
}
function logActivity(text) {
  try {
    var a = JSON.parse(localStorage.getItem("pinboard-activity") || "[]");
    a.unshift(text);
    localStorage.setItem("pinboard-activity", JSON.stringify(a.slice(0, 20)));
  } catch (e) {}
}
function renderActivity() {
  var list = $("activity-list");
  var a = [];
  try { a = JSON.parse(localStorage.getItem("pinboard-activity") || "[]"); } catch (e) { a = []; }
  list.innerHTML = "";
  if (!a.length) { list.innerHTML = "<div>No activity yet. Save or publish a pin and it will show here.</div>"; return; }
  a.forEach(function(item) { var d = document.createElement("div"); d.textContent = item; list.appendChild(d); });
}
function renderSearchGrid() {
  var container = $("search-grid");
  if (!container) { return; }
  container.innerHTML = "";
  var shown = 0;
  pins.forEach(function(pin) {
    if (currentCategory !== "All" && pin.category !== currentCategory) { return; }
    if (currentSearch && String(pin.title || "").toLowerCase().indexOf(currentSearch) === -1) { return; }
    shown++;
    container.appendChild(pinCard(pin, 0));
  });
  $("search-empty").classList.toggle("hidden", shown !== 0);
}
function renderSavedGrid() {
  var container = $("saved-grid");
  if (!container) { return; }
  container.innerHTML = "";
  var shown = 0;
  pins.forEach(function(pin) {
    if (!savedIds.has(pin.id)) { return; }
    shown++;
    container.appendChild(pinCard(pin, 0));
  });
  $("saved-empty").classList.toggle("hidden", shown !== 0);
}
function openSheet(id) { $(id).classList.remove("hidden"); if (id !== "board-sheet") { $("sheet-overlay").classList.remove("hidden"); } else { $("sheet-overlay").classList.remove("hidden"); } }
function closeSheets() { $("plus-sheet").classList.add("hidden"); $("board-sheet").classList.add("hidden"); $("sheet-overlay").classList.add("hidden"); }
function showStep(stepId, title) {
  ["step-picker", "step-editor", "step-details", "step-publish"].forEach(function(id) { $(id).classList.toggle("hidden", id !== stepId); });
  $("create-step-title").textContent = title;
}

// ---------- Feed (preserved) ----------
function pinCard(pin, index) {
  var card = document.createElement("div");
  var isCollage = pin.layout === "collage" && Array.isArray(pin.media) && pin.media.length > 1;
  var mediaHtml = "";
  if (isCollage) {
    mediaHtml = '<div class="collage-grid">' + pin.media.slice(0, 4).map(function(m) { return m.type === "video" ? '<video src="' + m.url + '" muted></video>' : '<img src="' + m.url + '" alt="Pin photo">'; }).join("") + "</div>";
  } else {
    var first = pin.image || (pin.media && pin.media[0] ? pin.media[0].url : "");
    var firstType = pin.media && pin.media[0] ? pin.media[0].type : "image";
    mediaHtml = firstType === "video" ? '<video src="' + first + '" controls muted></video>' : '<img src="' + first + '" alt="Pin photo">';
  }
  var own = currentUser && pin.user_id === currentUser.id;
  var liked = myLikes.has(pin.id);
  var likeCount = likeCounts[pin.id] || 0;
  card.innerHTML = mediaHtml + "<h3>" + escapeHtml(pin.title) + "</h3><p>" + escapeHtml(pin.category || "") + "</p>" +
    "<p class=\"muted\">by " + escapeHtml(pin.author_name || "PinBoard") + "</p>" +
    (pin.link ? '<p><a href="' + escapeHtml(pin.link) + '" target="_blank">Open link ↗</a></p>' : "") +
    // Like / download / Pinterest buttons. Clicking a button does NOT open the pin
    // (the card click handler below ignores BUTTON and A clicks).
    '<div class="pin-actions">' +
      '<button type="button" data-action="like" class="' + (liked ? "liked" : "") + '">' + (liked ? "❤️ " : "🤍 ") + likeCount + '</button>' +
      '<button type="button" data-action="download">⬇️ Download</button>' +
      '<button type="button" data-action="pinterest">📌 Pinterest</button>' +
    "</div>" +
    (own ? "<button type=\"button\" data-action=\"delete\">Delete</button>" : "");
  card.addEventListener("click", function(e) { if (e.target.tagName !== "BUTTON" && e.target.tagName !== "A") { openPin(pin.id); } });
  // Wire the buttons on this card (stopPropagation is not needed: the card
  // handler above already ignores button clicks).
  card.querySelector('[data-action="like"]').addEventListener("click", function() { toggleLike(pin.id, this); });
  card.querySelector('[data-action="download"]').addEventListener("click", function() { downloadPin(pin); });
  card.querySelector('[data-action="pinterest"]').addEventListener("click", function() { shareToPinterest(pin); });
  var delBtn = card.querySelector('[data-action="delete"]');
  if (delBtn) {
    delBtn.addEventListener("click", async function(e) {
      e.stopPropagation();
      if (!window.confirm("Delete this pin?")) { return; }
      var res = await sb.from("pins").delete().eq("id", pin.id);
      if (res.error) { showToast("Could not delete: " + res.error.message); return; }
      pins = pins.filter(function(p) { return p.id !== pin.id; }); saveCache(); renderFeed();
    });
  }
  return card;
}
function renderFeed() {
  var grid = $("grid"), gridLand = $("grid-landscape");
  grid.innerHTML = ""; gridLand.innerHTML = "";
  var shown = 0;
  pins.forEach(function(pin, index) {
    if (currentCategory !== "All" && pin.category !== currentCategory) { return; }
    if (currentSearch && String(pin.title || "").toLowerCase().indexOf(currentSearch) === -1) { return; }
    shown++;
    var card = pinCard(pin, index);
    var first = pin.image || (pin.media && pin.media[0] ? pin.media[0].url : "");
    var img = card.querySelector("img");
    // Collage and video go to landscape grid; otherwise classify by natural size, square/broken -> landscape
    if (pin.layout === "collage") { gridLand.appendChild(card); return; }
    var firstType = pin.media && pin.media[0] ? pin.media[0].type : "image";
    if (firstType === "video") { gridLand.appendChild(card); return; }
    if (!img) { gridLand.appendChild(card); return; }
    function place() {
      if (img.naturalHeight > img.naturalWidth) { grid.appendChild(card); } else { gridLand.appendChild(card); }
    }
    if (img.complete && img.naturalWidth) { place(); } else { img.onload = place; img.onerror = function() { gridLand.appendChild(card); }; }
  });
  $("feed-empty").classList.toggle("hidden", shown !== 0);
}
async function loadFeed() {
  try {
    var bq = await sb.from("boards").select("*").order("name");
    if (!bq.error && Array.isArray(bq.data)) { boards = bq.data; }
    var pq = sb.from("pins").select("*").order("created_at", { ascending: false }).limit(100);
    if (currentUser) { pq = pq.or("board_private.eq.false,user_id.eq." + currentUser.id); }
    else { pq = pq.eq("board_private", false); }
    var pr = await pq;
    if (pr.error) { throw pr.error; }
    pins = (pr.data || []).map(dbToPin);
    saveCache();
    $("feed-error").classList.add("hidden");
  } catch (e) {
    pins = loadCache().map(function(p) { p.saved = savedIds.has(p.id); return p; });
    var fe = $("feed-error");
    fe.textContent = "Could not load fresh pins — showing saved ones. Check your connection and tap Search to retry.";
    fe.classList.remove("hidden");
  }
  await loadLikes();
  renderFeed();
}
// First paint happens in gate() at the end of this file (public feed first, no login needed).

$("search").addEventListener("input", function() { currentSearch = $("search").value.trim().toLowerCase(); renderFeed(); renderSearchGrid(); });
$("search-button").addEventListener("click", function() { currentSearch = $("search").value.trim().toLowerCase(); loadFeed(); renderSearchGrid(); });
document.querySelectorAll("#filters button").forEach(function(btn) {
  btn.addEventListener("click", function() { currentCategory = btn.dataset.category; renderFeed(); renderSearchGrid(); });
});

// ---------- Home feed pager: phone = swipe left between 2 pages, PC = 2 columns ----------
(function() {
  var layout = $("feed-layout");
  if (!layout) { return; }
  var buttons = document.querySelectorAll("#feed-pager button");
  function setActive(index) {
    buttons.forEach(function(btn, i) { btn.classList.toggle("active", i === index); });
  }
  buttons.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var index = Number(btn.dataset.page) || 0;
      layout.scrollTo({ left: index * layout.clientWidth, behavior: "smooth" });
      setActive(index);
    });
  });
  layout.addEventListener("scroll", function() {
    var index = layout.clientWidth ? Math.round(layout.scrollLeft / layout.clientWidth) : 0;
    setActive(index);
  }, { passive: true });
})();

// ---------- Bottom nav (Instagram-style) + top bar ----------
document.querySelectorAll("#bottom-nav button[data-view]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    var view = btn.dataset.view;
    if (view === "profile-view" && !currentUser) { showView("auth-view"); showToast("Log in to see your profile."); return; }
    if (view === "profile-view") { renderProfile(); }
    showView(view);
  });
});
$("nav-create").addEventListener("click", function() { $("plus-button").click(); });
$("notifications-button").addEventListener("click", function() { showView("notifications-view"); });
$("dark-mode-button").addEventListener("click", function() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("pinboard-dark-mode", document.body.classList.contains("dark-mode") ? "on" : "off");
  $("dark-mode-button").textContent = document.body.classList.contains("dark-mode") ? "☀️" : "🌙";
});
if (localStorage.getItem("pinboard-dark-mode") === "on") {
  document.body.classList.add("dark-mode");
  $("dark-mode-button").textContent = "☀️";
}

// ---------- Plus menu ----------
$("plus-button").addEventListener("click", function() {
  if (!currentUser) { showView("auth-view"); showToast("Log in to post a pin."); return; }
  openSheet("plus-sheet");
});
$("plus-sheet-close").addEventListener("click", closeSheets);
$("sheet-overlay").addEventListener("click", closeSheets);
$("menu-create-pin").addEventListener("click", function() { closeSheets(); startFlow("pin"); });
$("menu-create-collage").addEventListener("click", function() { closeSheets(); startFlow("collage"); });
$("menu-create-board").addEventListener("click", function() { closeSheets(); openBoardSheet("create"); });

function startFlow(mode) {
  flowMode = mode;
  mediaItems = []; editorIndex = 0; selectedBoardId = null; selectedTopics = []; draftToRetry = null; publishing = false;
  $("detail-title").value = ""; $("detail-description").value = ""; $("detail-link").value = "";
  $("product-toggle").checked = false; $("product-fields").classList.add("hidden"); $("comments-allowed").checked = true;
  document.querySelectorAll("#topics-row .chip").forEach(function(c) { c.classList.remove("active"); });
  updateBoardName(); renderPicker(); showView("create-view"); showStep("step-picker", flowMode === "collage" ? "Pick 2–4 photos for a collage" : "Pick media");
  // Immediately open the real system picker
  var input = $("media-input");
  input.accept = flowMode === "collage" ? "image/*" : "image/*,video/*";
  input.click();
}
function updateBoardName() {
  var b = selectedBoardId ? boardById(selectedBoardId) : null;
  $("detail-board-name").textContent = b ? "Board: " + b.name + (b.private ? " (Private)" : "") : "No board selected yet.";
}

// ---------- Picker ----------
function triggerPicker() {
  var input = $("media-input");
  input.accept = flowMode === "collage" ? "image/*" : "image/*,video/*";
  input.click();
}
$("choose-media-btn").addEventListener("click", triggerPicker);
$("editor-add-more").addEventListener("click", triggerPicker);
$("media-input").addEventListener("cancel", function() {
  if (mediaItems.length === 0) { $("picker-cancelled").classList.remove("hidden"); }
});
// Shrink big photos before they go online, so the shared feed stays light on weak data.
function downscaleImage(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var max = 1200;
      var w = img.naturalWidth, h = img.naturalHeight;
      if (w <= max && h <= max) { resolve(dataUrl); return; }
      var s = Math.min(max / w, max / h);
      var c = document.createElement("canvas");
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = function() { resolve(dataUrl); };
    img.src = dataUrl;
  });
}

$("media-input").addEventListener("change", function() {
  var files = Array.prototype.slice.call($("media-input").files || []);
  $("picker-cancelled").classList.add("hidden");
  if (!files.length) { if (mediaItems.length === 0) { $("picker-cancelled").classList.remove("hidden"); } return; }
  var remaining = files.length, failed = 0;
  files.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function() {
      var dataUrl = reader.result;
      if (file.type.indexOf("image") === 0) {
        downscaleImage(dataUrl).then(function(small) {
          mediaItems.push({ type: "image", url: small, name: file.name, selected: true, editor: newEditor() });
          remaining--; if (remaining === 0) { renderPicker(); }
        });
      } else {
        mediaItems.push({ type: file.type.indexOf("video") === 0 ? "video" : "image", url: dataUrl, name: file.name, selected: true, editor: newEditor() });
        remaining--; if (remaining === 0) { renderPicker(); }
      }
    };
    reader.onerror = function() { failed++; remaining--; if (remaining === 0) { renderPicker(); showToast("Some files could not be read. Try smaller files."); } };
    reader.readAsDataURL(file);
  });
  $("media-input").value = "";
});
function setTab(tab) {
  pickerTab = tab;
  ["tab-all", "tab-photos", "tab-videos"].forEach(function(id) { $(id).classList.toggle("active", id === ("tab-" + tab)); });
  renderPicker();
}
$("tab-all").addEventListener("click", function() { setTab("all"); });
$("tab-photos").addEventListener("click", function() { setTab("photos"); });
$("tab-videos").addEventListener("click", function() { setTab("videos"); });

function renderPicker() {
  var grid = $("picker-grid"); grid.innerHTML = "";
  var list = mediaItems.filter(function(m) { return pickerTab === "all" || (pickerTab === "photos" && m.type === "image") || (pickerTab === "videos" && m.type === "video"); });
  list.forEach(function(item) {
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "picker-item" + (item.selected ? " selected" : "");
    btn.innerHTML = (item.type === "video" ? '<video src="' + item.url + '" muted></video>' : '<img src="' + item.url + '" alt="Selected media">') + (item.selected ? '<span class="check-badge">✓</span>' : "");
    btn.addEventListener("click", function() { item.selected = !item.selected; renderPicker(); });
    grid.appendChild(btn);
  });
  var sel = selectedMedia().length;
  $("picker-count").textContent = sel + " selected";
  $("picker-empty").classList.toggle("hidden", mediaItems.length !== 0);
  $("picker-next").disabled = sel === 0;
  if (flowMode === "collage" && sel > 0 && sel < 2) { $("picker-count").textContent = sel + " selected — pick at least 2 for a collage"; }
}
$("picker-next").addEventListener("click", function() {
  var sel = selectedMedia();
  if (!sel.length) { return; }
  if (flowMode === "collage" && sel.length < 2) { showToast("Pick at least 2 photos for a collage."); return; }
  editorIndex = mediaItems.indexOf(sel[0]);
  renderEditor(); showStep("step-editor", "Edit");
});

// ---------- Editor ----------
function editorFilterCss(ed) {
  var parts = ["brightness(" + ed.brightness + "%)", "contrast(" + ed.contrast + "%)", "saturate(" + ed.saturation + "%)"];
  if (ed.filter === "grayscale") { parts.push("grayscale(100%)"); }
  if (ed.filter === "sepia") { parts.push("sepia(100%)"); }
  if (ed.filter === "vivid") { parts.push("saturate(150%)"); }
  return parts.join(" ");
}
function renderEditor() {
  var item = mediaItems[editorIndex];
  if (!item) { showStep("step-picker", "Pick media"); return; }
  var ed = item.editor;
  var preview = $("editor-preview");
  var aspectStyle = ed.aspect === "original" ? "" : "aspect-ratio:" + ed.aspect + ";";
  preview.style.cssText = aspectStyle;
  var mediaHtml = item.type === "video"
    ? '<video id="editor-video" src="' + item.url + '" controls style="transform:rotate(' + ed.rotation + 'deg);width:100%;"></video>'
    : '<img src="' + item.url + '" alt="Preview" style="transform:rotate(' + ed.rotation + 'deg);filter:' + editorFilterCss(ed) + ';width:100%;">';
  preview.innerHTML = mediaHtml + (ed.text ? '<div class="overlay-text ' + ed.position + '" style="color:' + ed.color + ';font-size:' + ed.size + 'px;">' + escapeHtml(ed.text) + "</div>" : "");
  // Video: hide image-only controls, show duration from metadata
  $("editor-image-controls").classList.toggle("hidden", item.type === "video");
  var vid = $("editor-video");
  if (vid) {
    $("video-duration").classList.remove("hidden");
    $("video-duration").textContent = "Video preview — duration will show when it loads.";
    vid.addEventListener("loadedmetadata", function() { $("video-duration").textContent = "Duration: " + Math.round(vid.duration) + " seconds"; });
  } else { $("video-duration").classList.add("hidden"); }
  // Sync controls
  document.querySelectorAll("#aspect-row .chip").forEach(function(c) { c.classList.toggle("active", c.dataset.aspect === ed.aspect); });
  $("overlay-text").value = ed.text; $("overlay-position").value = ed.position; $("overlay-color").value = ed.color; $("overlay-size").value = ed.size;
  $("filter-preset").value = ed.filter; $("brightness").value = ed.brightness; $("contrast").value = ed.contrast; $("saturation").value = ed.saturation;
  // Thumbs
  var thumbs = $("editor-thumbs"); thumbs.innerHTML = "";
  selectedMedia().forEach(function(m) {
    var b = document.createElement("button"); b.type = "button"; b.className = "picker-item" + (mediaItems.indexOf(m) === editorIndex ? " selected" : "");
    b.innerHTML = m.type === "video" ? '<video src="' + m.url + '" muted></video>' : '<img src="' + m.url + '" alt="Media">';
    b.addEventListener("click", function() { editorIndex = mediaItems.indexOf(m); renderEditor(); });
    thumbs.appendChild(b);
  });
}
function currentEditor() { return mediaItems[editorIndex] ? mediaItems[editorIndex].editor : newEditor(); }
document.querySelectorAll("#aspect-row .chip").forEach(function(c) { c.addEventListener("click", function() { currentEditor().aspect = c.dataset.aspect; renderEditor(); }); });
$("rotate-btn").addEventListener("click", function() { var ed = currentEditor(); ed.rotation = (ed.rotation + 90) % 360; renderEditor(); });
["overlay-text", "overlay-position", "overlay-color", "overlay-size", "filter-preset", "brightness", "contrast", "saturation"].forEach(function(id) {
  $(id).addEventListener("input", function() {
    var ed = currentEditor();
    if (id === "overlay-text") { ed.text = $(id).value; }
    if (id === "overlay-position") { ed.position = $(id).value; }
    if (id === "overlay-color") { ed.color = $(id).value; }
    if (id === "overlay-size") { ed.size = Number($(id).value); }
    if (id === "filter-preset") { ed.filter = $(id).value; }
    if (id === "brightness") { ed.brightness = Number($(id).value); }
    if (id === "contrast") { ed.contrast = Number($(id).value); }
    if (id === "saturation") { ed.saturation = Number($(id).value); }
    renderEditor();
  });
});
$("editor-delete").addEventListener("click", function() {
  if (!window.confirm("Remove this media from this pin?")) { return; }
  mediaItems.splice(editorIndex, 1);
  if (!selectedMedia().length) { renderPicker(); showStep("step-picker", "Pick media"); return; }
  editorIndex = Math.max(0, editorIndex - 1); renderEditor();
});
$("editor-back").addEventListener("click", function() { renderPicker(); showStep("step-picker", "Pick media"); });
$("editor-next").addEventListener("click", function() { showStep("step-details", "Pin details"); });

// ---------- Details ----------
document.querySelectorAll("#topics-row .chip").forEach(function(c) {
  c.addEventListener("click", function() {
    var t = c.dataset.topic;
    if (selectedTopics.indexOf(t) === -1) { selectedTopics.push(t); c.classList.add("active"); } else { selectedTopics = selectedTopics.filter(function(x) { return x !== t; }); c.classList.remove("active"); }
  });
});
$("product-toggle").addEventListener("change", function() { $("product-fields").classList.toggle("hidden", !$("product-toggle").checked); });
$("detail-board-btn").addEventListener("click", function() { openBoardSheet("select"); });
$("detail-create-board").addEventListener("click", function() { openBoardSheet("create"); });
$("details-back").addEventListener("click", function() { renderEditor(); showStep("step-editor", "Edit"); });
$("details-next").addEventListener("click", function() {
  var err = $("details-error"); err.classList.add("hidden");
  if (!$("detail-title").value.trim()) { err.textContent = "Title is required."; err.classList.remove("hidden"); return; }
  if (!selectedMedia().length) { err.textContent = "Pick at least one photo or video first."; err.classList.remove("hidden"); return; }
  if (!selectedBoardId) { err.textContent = "Choose a board first, or create a new board."; err.classList.remove("hidden"); openBoardSheet("select"); return; }
  renderPublishPreview(); showStep("step-publish", "Publish");
});

// ---------- Boards ----------
function openBoardSheet(mode) {
  boardSheetMode = mode;
  $("board-sheet-title").textContent = mode === "change-board" ? "Change Board" : "Select Board";
  $("board-create-form").classList.toggle("hidden", mode !== "create");
  renderBoardList(); openSheet("board-sheet");
}
function renderBoardList() {
  var q = $("board-search").value.trim().toLowerCase();
  var list = $("board-list"); list.innerHTML = "";
  var filtered = boards.filter(function(b) {
    if (b.private && (!currentUser || b.user_id !== currentUser.id)) { return false; }
    return !q || b.name.toLowerCase().indexOf(q) !== -1;
  });
  filtered.forEach(function(b) {
    var firstPin = pins.find(function(p) { return p.boardId === b.id; });
    var thumb = firstPin && firstPin.image ? '<img src="' + firstPin.image + '" alt="">' : b.name.slice(0, 1).toUpperCase();
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "board-item";
    btn.innerHTML = '<span class="board-thumb">' + thumb + '</span><span class="menu-text"><strong>' + escapeHtml(b.name) + '</strong><small>' + boardCount(b.id) + " pins" + (b.private ? " • Private" : " • Public") + "</small></span><span class=\"menu-arrow\">›</span>";
    btn.addEventListener("click", async function() {
      if (boardSheetMode === "change-board" && currentPinId) {
        var pin = pins.find(function(p) { return p.id === currentPinId; });
        if (pin) {
          var upd = await sb.from("pins").update({ board_id: b.id, board_private: !!b.private }).eq("id", pin.id);
          if (upd.error) { showToast("Could not move pin: " + upd.error.message); closeSheets(); return; }
          pin.boardId = b.id; pin.board_private = !!b.private; saveCache(); renderFeed(); renderPinView(); showToast("Board changed.");
        }
      } else {
        selectedBoardId = b.id; updateBoardName();
        if (boardSheetMode === "select") { closeSheets(); showStep("step-details", "Pin details"); }
      }
      closeSheets();
    });
    list.appendChild(btn);
  });
  $("board-empty").classList.toggle("hidden", filtered.length !== 0);
}
$("board-search").addEventListener("input", renderBoardList);
$("board-sheet-close").addEventListener("click", closeSheets);
$("board-show-create").addEventListener("click", function() { $("board-create-form").classList.remove("hidden"); });
$("board-create-save").addEventListener("click", async function() {
  var name = $("board-name").value.trim(); var err = $("board-create-error"); err.classList.add("hidden");
  if (!name) { err.textContent = "Board name is required."; err.classList.remove("hidden"); return; }
  if (!currentUser) { err.textContent = "Log in to create a board."; err.classList.remove("hidden"); return; }
  var ins = await sb.from("boards").insert({ user_id: currentUser.id, name: name, private: $("board-private").checked }).select().single();
  if (ins.error) { err.textContent = "Could not create board: " + ins.error.message; err.classList.remove("hidden"); return; }
  var board = ins.data;
  boards.push(board); $("board-name").value = ""; $("board-private").checked = false;
  if (boardSheetMode === "change-board" && currentPinId) {
    var pin = pins.find(function(p) { return p.id === currentPinId; });
    if (pin) {
      var upd = await sb.from("pins").update({ board_id: board.id, board_private: !!board.private }).eq("id", pin.id);
      if (!upd.error) { pin.boardId = board.id; pin.board_private = !!board.private; saveCache(); renderFeed(); renderPinView(); }
    }
    closeSheets(); showToast("Board created and pin moved.");
  } else {
    selectedBoardId = board.id; updateBoardName(); renderBoardList(); closeSheets(); showStep("step-details", "Pin details"); showToast("Board created.");
  }
});

// ---------- Publish ----------
function renderPublishPreview() {
  var sel = selectedMedia();
  var board = selectedBoardId ? boardById(selectedBoardId) : null;
  var first = sel[0];
  $("publish-preview").innerHTML = first ? (first.type === "video" ? '<video src="' + first.url + '" controls style="width:100%;border-radius:20px;"></video>' : '<img src="' + first.url + '" alt="Preview" style="width:100%;border-radius:20px;">') : "<p>No media.</p>";
  $("publish-summary").textContent = $("detail-title").value.trim() + " • Board: " + (board ? board.name : "—") + " • " + sel.length + " media" + (flowMode === "collage" ? " • Collage" : "");
  $("publish-error").classList.add("hidden"); $("publish-retry").classList.add("hidden"); $("publish-progress").classList.add("hidden");
}
$("publish-back").addEventListener("click", function() { showStep("step-details", "Pin details"); });
$("publish-btn").addEventListener("click", publishPin);
$("publish-retry").addEventListener("click", publishPin);
function publishPin() {
  if (publishing) { return; }
  var err = $("publish-error"); err.classList.add("hidden");
  var title = $("detail-title").value.trim();
  if (!title) { err.textContent = "Title is required."; err.classList.remove("hidden"); return; }
  var sel = selectedMedia();
  if (!sel.length) { err.textContent = "Pick at least one photo or video first."; err.classList.remove("hidden"); return; }
  if (!selectedBoardId) { err.textContent = "Choose a board first."; err.classList.remove("hidden"); return; }
  publishing = true; $("publish-btn").disabled = true; $("publish-btn").textContent = "Publishing…";
  $("publish-progress").classList.remove("hidden");
  var percent = 0;
  var timer = setInterval(async function() {
    percent += 5;
    if (percent > 100) { percent = 100; }
    $("publish-progress-bar").style.width = percent + "%";
    $("publish-progress-text").textContent = percent + "%";
    if (percent >= 100) {
      clearInterval(timer);
      try {
        var board = selectedBoardId ? boardById(selectedBoardId) : null;
        var pinData = {
          title: title, description: $("detail-description").value.trim(), link: $("detail-link").value.trim(),
          category: selectedTopics[0] || "Other", topics: selectedTopics.slice(), boardId: selectedBoardId,
          board_private: board ? !!board.private : false,
          image: sel[0].url, media: sel.map(function(m) { return { type: m.type, url: m.url, editor: m.editor }; }),
          layout: flowMode === "collage" ? "collage" : "single",
          product: $("product-toggle").checked ? { name: $("product-name").value.trim(), link: $("product-link").value.trim() } : null,
          commentsAllowed: $("comments-allowed").checked
        };
        var ins = await sb.from("pins").insert(pinToDb(pinData, currentUser)).select().single();
        if (ins.error) { throw new Error(ins.error.message); }
        var pin = dbToPin(ins.data);
        pins.unshift(pin); saveCache();
        logActivity("You published " + pin.title);
        publishing = false; $("publish-btn").disabled = false; $("publish-btn").textContent = "Publish";
        renderFeed(); currentPinId = pin.id;
        $("pin-published-msg").classList.remove("hidden");
        renderPinView(); showView("pin-view"); showToast("Published!");
        // Reset draft so a second publish cannot duplicate it
        mediaItems = []; selectedBoardId = null; selectedTopics = [];
      } catch (e) {
        publishing = false; $("publish-btn").disabled = false; $("publish-btn").textContent = "Publish";
        err.textContent = "Could not save this pin (storage may be full — try smaller photos). Your draft is kept. " + e.message;
        err.classList.remove("hidden"); $("publish-retry").classList.remove("hidden");
      }
    }
  }, 30);
}

// ---------- Pin view ----------
function renderPinView() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (!pin) { showView("feed-view"); return; }
  var board = pin.boardId ? boardById(pin.boardId) : null;
  var mediaHtml = "";
  if (pin.layout === "collage" && Array.isArray(pin.media) && pin.media.length > 1) {
    mediaHtml = '<div class="collage-grid">' + pin.media.map(function(m) { return m.type === "video" ? '<video src="' + m.url + '" controls></video>' : '<img src="' + m.url + '" alt="Pin photo">'; }).join("") + "</div>";
  } else if (pin.media && pin.media[0] && pin.media[0].type === "video") {
    mediaHtml = '<video src="' + pin.media[0].url + '" controls></video>';
  } else {
    var ed = pin.media && pin.media[0] && pin.media[0].editor ? pin.media[0].editor : null;
    var style = ed ? "transform:rotate(" + ed.rotation + "deg);filter:" + editorFilterCss(ed) + ";" : "";
    mediaHtml = '<div style="position:relative;"><img src="' + (pin.image || "") + '" alt="Pin photo" style="' + style + '">' + (ed && ed.text ? '<div class="overlay-text ' + ed.position + '" style="color:' + ed.color + ';font-size:' + ed.size + 'px;">' + escapeHtml(ed.text) + "</div>" : "") + "</div>";
  }
  $("pin-content").innerHTML = mediaHtml + "<h3>" + escapeHtml(pin.title) + "</h3><p>" + escapeHtml(pin.description || "") + "</p><p class=\"muted\">by " + escapeHtml(pin.author_name || "PinBoard") + " • " + escapeHtml(pin.category || "") + (board ? " • Board: " + escapeHtml(board.name) : "") + (pin.topics && pin.topics.length ? " • " + escapeHtml(pin.topics.join(", ")) : "") + "</p>" + (pin.link ? '<p><a href="' + escapeHtml(pin.link) + '" target="_blank">Open link ↗</a></p>' : "");
  $("pin-save-toggle").textContent = pin.saved ? "Saved ✓" : "Save";
  $("pin-open-link").style.display = pin.link ? "" : "none";
  var own = currentUser && pin.user_id === currentUser.id;
  $("pin-edit").style.display = own ? "" : "none";
  $("pin-change-board").style.display = own ? "" : "none";
  $("pin-delete").style.display = own ? "" : "none";
  updatePinLikeButton(pin);
  loadPinComments(pin);
}
function openPin(id) { currentPinId = id; $("pin-published-msg").classList.add("hidden"); $("pin-edit-form").classList.add("hidden"); renderPinView(); showView("pin-view"); }
$("pin-back").addEventListener("click", function() { showView("feed-view"); renderFeed(); });
$("pin-close").addEventListener("click", function() { showView("feed-view"); renderFeed(); });
$("create-back").addEventListener("click", function() { showView("feed-view"); renderFeed(); });
$("create-close").addEventListener("click", function() { showView("feed-view"); renderFeed(); });
$("pin-edit").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; }); if (!pin) { return; }
  $("pin-edit-title").value = pin.title; $("pin-edit-description").value = pin.description || "";
  $("pin-edit-form").classList.toggle("hidden");
});
$("pin-edit-save").addEventListener("click", async function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; }); if (!pin) { return; }
  var newTitle = $("pin-edit-title").value.trim() || pin.title;
  var newDesc = $("pin-edit-description").value.trim();
  var upd = await sb.from("pins").update({ title: newTitle, description: newDesc }).eq("id", pin.id);
  if (upd.error) { showToast("Could not save: " + upd.error.message); return; }
  pin.title = newTitle; pin.description = newDesc;
  saveCache(); $("pin-edit-form").classList.add("hidden"); renderPinView(); renderFeed(); showToast("Pin updated.");
});
$("pin-change-board").addEventListener("click", function() { openBoardSheet("change-board"); });
$("pin-share").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; }); if (!pin) { return; }
  var text = pin.title + " — PinBoard";
  if (navigator.share) { navigator.share({ title: pin.title, text: text }).catch(function() {}); }
  else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function() { showToast("Link copied to clipboard."); }); }
  else { showToast(text); }
});
$("pin-save-toggle").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; }); if (!pin) { return; }
  if (savedIds.has(pin.id)) { savedIds.delete(pin.id); } else { savedIds.add(pin.id); logActivity("You saved " + pin.title); }
  saveSavedIds(); pin.saved = savedIds.has(pin.id); renderPinView(); showToast(pin.saved ? "Saved." : "Unsaved.");
});
$("pin-delete").addEventListener("click", async function() {
  if (!window.confirm("Delete this pin? This cannot be undone.")) { return; }
  var del = await sb.from("pins").delete().eq("id", currentPinId);
  if (del.error) { showToast("Could not delete: " + del.error.message); return; }
  pins = pins.filter(function(p) { return p.id !== currentPinId; }); saveCache(); renderFeed(); showView("feed-view");
});
$("pin-like").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (pin) { toggleLike(pin.id, null); }
});
$("pin-download").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (pin) { downloadPin(pin); }
});
$("pin-pinterest").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (pin) { shareToPinterest(pin); }
});
$("pin-comment-add").addEventListener("click", postComment);
$("pin-comment-input").addEventListener("keydown", function(e) { if (e.key === "Enter") { postComment(); } });
$("pin-open-link").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (pin && pin.link) { window.open(pin.link, "_blank"); }
});

// ---------- Discover controls (search box, topic chips, source, fill button) ----------
$("discover-search-button").addEventListener("click", function() {
  var q = $("discover-search").value.trim();
  if (q) { discoverQuery = q; }
  searchDiscover(discoverQuery, $("discover-source").value);
});
$("discover-search").addEventListener("keydown", function(e) {
  if (e.key === "Enter") { $("discover-search-button").click(); }
});
$("discover-source").addEventListener("change", function() {
  searchDiscover(discoverQuery, $("discover-source").value);
});
document.querySelectorAll("#discover-chips .chip").forEach(function(c) {
  c.addEventListener("click", function() {
    document.querySelectorAll("#discover-chips .chip").forEach(function(x) { x.classList.remove("active"); });
    c.classList.add("active");
    discoverQuery = c.dataset.topic;
    $("discover-search").value = discoverQuery;
    searchDiscover(discoverQuery, $("discover-source").value);
  });
});
$("discover-fill-btn").addEventListener("click", fillFeedFromDiscover);

// ---------- Likes (Supabase "likes" table: one row per person per pin) ----------
// If the likes table does not exist yet (SQL not run), counts just stay at 0.
async function loadLikes() {
  likeCounts = {};
  myLikes = new Set();
  if (!pins.length) { return; }
  try {
    var res = await sb.from("likes").select("pin_id,user_id").in("pin_id", pins.map(function(p) { return p.id; }));
    if (res.error || !Array.isArray(res.data)) { return; }
    res.data.forEach(function(row) {
      likeCounts[row.pin_id] = (likeCounts[row.pin_id] || 0) + 1;
      if (currentUser && row.user_id === currentUser.id) { myLikes.add(row.pin_id); }
    });
  } catch (e) { /* likes table missing — feed still works, counts stay 0 */ }
}
function updatePinLikeButton(pin) {
  var btn = $("pin-like");
  if (!btn) { return; }
  var liked = myLikes.has(pin.id);
  var count = likeCounts[pin.id] || 0;
  btn.textContent = (liked ? "❤️ Liked " : "🤍 Like ") + (count ? "(" + count + ")" : "");
}
async function toggleLike(pinId, btn) {
  // Login first: likes belong to a real account, not to a device.
  if (!currentUser) { showView("auth-view"); showToast("Log in to like pins."); return; }
  var liked = myLikes.has(pinId);
  // Update the button right away, undo it if Supabase says no.
  if (liked) { myLikes.delete(pinId); likeCounts[pinId] = Math.max(0, (likeCounts[pinId] || 1) - 1); }
  else { myLikes.add(pinId); likeCounts[pinId] = (likeCounts[pinId] || 0) + 1; }
  var pin = pins.find(function(p) { return p.id === pinId; });
  if (btn) { btn.textContent = (myLikes.has(pinId) ? "❤️ " : "🤍 ") + (likeCounts[pinId] || 0); btn.classList.toggle("liked", myLikes.has(pinId)); }
  if (pin) { updatePinLikeButton(pin); }
  var res;
  if (liked) { res = await sb.from("likes").delete().eq("pin_id", pinId).eq("user_id", currentUser.id); }
  else { res = await sb.from("likes").insert({ pin_id: pinId, user_id: currentUser.id }); }
  if (res.error) {
    // Undo the quick update above.
    if (liked) { myLikes.add(pinId); likeCounts[pinId] = (likeCounts[pinId] || 0) + 1; }
    else { myLikes.delete(pinId); likeCounts[pinId] = Math.max(0, (likeCounts[pinId] || 1) - 1); }
    if (btn) { btn.textContent = (myLikes.has(pinId) ? "❤️ " : "🤍 ") + (likeCounts[pinId] || 0); btn.classList.toggle("liked", myLikes.has(pinId)); }
    if (pin) { updatePinLikeButton(pin); }
    showToast("Could not save that like: " + res.error.message);
  }
}

// ---------- Download a pin (real file download, with a long-press fallback) ----------
function pinImageUrl(pin) {
  if (pin.image) { return pin.image; }
  if (pin.media && pin.media[0]) { return pin.media[0].url; }
  return "";
}
function pinFileName(pin) {
  var url = pinImageUrl(pin);
  var ext = ".jpg";
  if (/\.png(\?|$)/i.test(url)) { ext = ".png"; }
  if (/\.webp(\?|$)/i.test(url)) { ext = ".webp"; }
  return "pinboard-" + String(pin.id).slice(0, 8) + ext;
}
async function downloadPin(pin) {
  var url = pinImageUrl(pin);
  if (!url) { showToast("This pin has no image to download."); return; }
  if (pin.media && pin.media[0] && pin.media[0].type === "video") {
    window.open(url, "_blank");
    showToast("Videos open in a new tab — long-press to save.");
    return;
  }
  try {
    // Fetch the photo, turn it into a file, and trigger a real download.
    var res = await fetch(url, { mode: "cors" });
    if (!res.ok) { throw new Error("Photo could not be fetched."); }
    var blob = await res.blob();
    var objectUrl = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = objectUrl; a.download = pinFileName(pin);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(objectUrl); }, 5000);
    showToast("Saved — check your downloads.");
  } catch (e) {
    // Some photo hosts block direct fetching. Open the photo instead so the
    // user can long-press it and save it by hand.
    window.open(url, "_blank");
    showToast("Download was blocked — long-press the photo to save it.");
  }
}

// ---------- Share to Pinterest (your OWN pins only, you pick the board there) ----------
// No Pinterest API, no auto-posting, no login: this just opens Pinterest's
// own "create a pin" page with your photo already filled in. You choose
// the board on Pinterest and tap Save there.
function shareToPinterest(pin) {
  var url = pinImageUrl(pin);
  if (!url) { showToast("This pin has no image to share."); return; }
  var pageUrl = window.location.href.split("#")[0] + "#pin-" + pin.id;
  var shareUrl = "https://pinterest.com/pin/create/button/?url=" + encodeURIComponent(pageUrl) +
    "&media=" + encodeURIComponent(url) +
    "&description=" + encodeURIComponent(pin.title || "PinBoard");
  window.open(shareUrl, "_blank");
}

// ---------- Comments (Supabase "comments" table, newest first) ----------
async function loadPinComments(pin) {
  var list = $("pin-comments-list");
  var note = $("pin-comments-note");
  var input = $("pin-comment-input");
  var addBtn = $("pin-comment-add");
  if (!list) { return; }
  list.innerHTML = "";
  note.classList.add("hidden");
  // The pin owner can switch comments off for a pin.
  if (pin.commentsAllowed === false) {
    note.textContent = "Comments are turned off for this pin.";
    note.classList.remove("hidden");
    input.disabled = true; addBtn.disabled = true;
    return;
  }
  input.disabled = false; addBtn.disabled = false;
  if (!currentUser) { note.textContent = "Log in to write a comment."; note.classList.remove("hidden"); }
  try {
    var res = await sb.from("comments").select("*").eq("pin_id", pin.id).order("created_at", { ascending: false });
    if (res.error) { throw res.error; }
    var rows = res.data || [];
    if (!rows.length) { list.innerHTML = '<p class="muted">No comments yet — be the first.</p>'; return; }
    rows.forEach(function(c) {
      var item = document.createElement("div");
      item.className = "comment-item";
      var when = c.created_at ? new Date(c.created_at).toLocaleString() : "";
      var own = currentUser && c.user_id === currentUser.id;
      item.innerHTML = "<strong>" + escapeHtml(c.author_name || "PinBoard") + "</strong> <span class=\"muted\">" + escapeHtml(when) + "</span><p>" + escapeHtml(c.body || "") + "</p>" +
        (own ? '<button type="button" class="secondary-btn">Delete</button>' : "");
      var del = item.querySelector("button");
      if (del) {
        del.addEventListener("click", async function() {
          if (!window.confirm("Delete this comment?")) { return; }
          var r = await sb.from("comments").delete().eq("id", c.id).eq("user_id", currentUser.id);
          if (r.error) { showToast("Could not delete: " + r.error.message); return; }
          loadPinComments(pin);
        });
      }
      list.appendChild(item);
    });
  } catch (e) {
    // The comments table does not exist yet (new SQL not run) — say so plainly.
    list.innerHTML = '<p class="muted">Comments are not set up yet — run the new likes + comments SQL in Supabase, then reload.</p>';
  }
}
async function postComment() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (!pin) { return; }
  if (!currentUser) { showView("auth-view"); showToast("Log in to write a comment."); return; }
  var body = $("pin-comment-input").value.trim();
  if (!body) { showToast("Write something first."); return; }
  var res = await sb.from("comments").insert({ pin_id: pin.id, user_id: currentUser.id, author_name: displayName(currentUser), body: body });
  if (res.error) { showToast("Could not post: " + res.error.message); return; }
  $("pin-comment-input").value = "";
  loadPinComments(pin);
}

// ---------- Discover: free photos (Openverse first, no key needed) ----------
// Openverse: https://api.openverse.org/v1/images/?q=rooms — free, no key.
// Unsplash and Pixabay only run when their key above is filled in; otherwise
// they are skipped quietly and Openverse results are shown instead.
function discoverCategoryFor(topic) {
  if (topic === "rooms") { return "Room"; }
  if (topic === "cars") { return "Car"; }
  if (topic === "fashion") { return "Item"; }
  return "Other";
}
function discoverBoardFor() {
  // Discover pins need a board. Use "Cool finds" (a public seed board) if it
  // is there, otherwise the first board, otherwise no board at all.
  return boards.find(function(b) { return b.name === "Cool finds"; }) || boards[0] || null;
}
async function searchDiscover(query, source) {
  discoverQuery = query || discoverQuery;
  discoverSource = source || discoverSource;
  var q = encodeURIComponent(discoverQuery);
  var err = $("discover-error"); err.classList.add("hidden");
  var grid = $("discover-grid"); grid.innerHTML = "";
  $("discover-note").textContent = "Searching " + discoverSource + " for “" + discoverQuery + "”…";
  try {
    var results = [];
    if (discoverSource === "unsplash") {
      if (!UNSPLASH_ACCESS_KEY) { showToast("Add your Unsplash key at the top of app.js first — showing Openverse instead."); discoverSource = "openverse"; $("discover-source").value = "openverse"; }
      else {
        var u = await fetch("https://api.unsplash.com/search/photos?query=" + q + "&per_page=20", { headers: { Authorization: "Client-ID " + UNSPLASH_ACCESS_KEY } });
        if (!u.ok) { throw new Error("Unsplash said no (check the key)."); }
        var ud = await u.json();
        results = (ud.results || []).map(function(r) {
          return { title: r.alt_description || r.description || "Unsplash photo", image: r.urls.regular, credit: "Photo by " + (r.user && r.user.name ? r.user.name : "Unknown") + " on Unsplash", sourceUrl: (r.links && r.links.html) || "https://unsplash.com", sourceName: "Unsplash" };
        });
      }
    }
    if (discoverSource === "pixabay") {
      if (!PIXABAY_API_KEY) { showToast("Add your Pixabay key at the top of app.js first — showing Openverse instead."); discoverSource = "openverse"; $("discover-source").value = "openverse"; }
      else {
        var p = await fetch("https://pixabay.com/api/?key=" + encodeURIComponent(PIXABAY_API_KEY) + "&q=" + q + "&image_type=photo&per_page=20&safesearch=true");
        if (!p.ok) { throw new Error("Pixabay said no (check the key)."); }
        var pd = await p.json();
        results = (pd.hits || []).map(function(r) {
          return { title: (r.tags || "Pixabay photo").split(",")[0].trim() || "Pixabay photo", image: r.largeImageURL || r.webformatURL, credit: "Photo by " + (r.user || "Unknown") + " on Pixabay", sourceUrl: r.pageURL || "https://pixabay.com", sourceName: "Pixabay" };
        });
      }
    }
    if (discoverSource === "openverse") {
      var o = await fetch("https://api.openverse.org/v1/images/?q=" + q + "&page_size=20&license_type=commercial");
      if (!o.ok) { throw new Error("Openverse could not be reached."); }
      var od = await o.json();
      results = (od.results || []).map(function(r) {
        return { title: r.title || "Free photo", image: r.url, credit: "Photo by " + (r.creator || "Unknown") + " on Openverse", sourceUrl: r.foreign_landing_url || r.url, sourceName: "Openverse" };
      });
    }
    discoverResults = results.filter(function(r) { return r.image; });
    $("discover-note").textContent = "Source: " + discoverSource + " — " + discoverResults.length + " photos. Tap “Save as pin” on any photo, or fill your feed with 10 at once.";
    renderDiscover();
  } catch (e) {
    err.textContent = "Discover search failed: " + e.message + " Check your connection and try again.";
    err.classList.remove("hidden");
    $("discover-note").textContent = "Source: " + discoverSource + ".";
  }
}
function renderDiscover() {
  var grid = $("discover-grid");
  if (!grid) { return; }
  grid.innerHTML = "";
  discoverResults.forEach(function(r) {
    var card = document.createElement("div");
    card.innerHTML = '<img src="' + escapeHtml(r.image) + '" alt="Free photo" loading="lazy">' +
      "<h3>" + escapeHtml(r.title) + "</h3>" +
      '<p class="muted">' + escapeHtml(r.credit) + "</p>" +
      '<button type="button" class="discover-save">📌 Save as pin</button>';
    card.querySelector(".discover-save").addEventListener("click", function() { saveDiscoverPin(r, this); });
    grid.appendChild(card);
  });
  $("discover-empty").classList.toggle("hidden", discoverResults.length !== 0);
  // First visit: search for something so the page is never empty.
  if (!discoverResults.length && !discoverSearched) {
    discoverSearched = true;
    searchDiscover(discoverQuery, discoverSource);
  }
}
async function saveDiscoverPin(r, btn) {
  // Discover pins go online under your name, like any pin you post.
  if (!currentUser) { showView("auth-view"); showToast("Sign up or log in first, then save photos as pins."); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    var board = discoverBoardFor();
    var pinData = {
      title: r.title, description: r.credit + " — " + r.sourceUrl, link: r.sourceUrl,
      category: discoverCategoryFor(discoverQuery), topics: [discoverCategoryFor(discoverQuery)],
      boardId: board ? board.id : null, board_private: board ? !!board.private : false,
      image: r.image, media: [{ type: "image", url: r.image }],
      layout: "single", product: null, commentsAllowed: true
    };
    var ins = await sb.from("pins").insert(pinToDb(pinData, currentUser)).select().single();
    if (ins.error) { throw new Error(ins.error.message); }
    pins.unshift(dbToPin(ins.data)); saveCache(); renderFeed();
    showToast("Saved as a pin — it is live on your feed.");
  } catch (e) {
    showToast("Could not save that pin: " + e.message);
  }
  if (btn) { btn.disabled = false; btn.textContent = "📌 Save as pin"; }
}
async function fillFeedFromDiscover() {
  if (discoverFilling) { return; }
  if (!currentUser) { showView("auth-view"); showToast("Sign up or log in first, then fill your feed."); return; }
  if (!discoverResults.length) { await searchDiscover(discoverQuery, discoverSource); }
  var take = discoverResults.slice(0, 10);
  if (!take.length) { showToast("No photos to save yet — search first."); return; }
  discoverFilling = true;
  var btn = $("discover-fill-btn"); btn.disabled = true; btn.textContent = "Filling your feed…";
  var added = 0;
  for (var i = 0; i < take.length; i++) {
    btn.textContent = "Filling your feed… " + added + "/" + take.length;
    try {
      var board = discoverBoardFor();
      var pinData = {
        title: take[i].title, description: take[i].credit + " — " + take[i].sourceUrl, link: take[i].sourceUrl,
        category: discoverCategoryFor(discoverQuery), topics: [discoverCategoryFor(discoverQuery)],
        boardId: board ? board.id : null, board_private: board ? !!board.private : false,
        image: take[i].image, media: [{ type: "image", url: take[i].image }],
        layout: "single", product: null, commentsAllowed: true
      };
      var ins = await sb.from("pins").insert(pinToDb(pinData, currentUser)).select().single();
      if (!ins.error) { pins.unshift(dbToPin(ins.data)); added++; }
    } catch (e) { /* keep going with the next photo */ }
  }
  saveCache(); renderFeed();
  discoverFilling = false;
  btn.disabled = false; btn.textContent = "✨ Fill my feed — 10 fresh pins";
  showToast(added ? "Added " + added + " fresh pins to your feed!" : "Nothing was added — check your connection and try again.");
}

// ---------- Real accounts (Supabase Auth) ----------
// Anyone can view the feed. Posting needs an account. The old device-only
// login (pinboard-users) is gone — accounts now live in Supabase, and
// email confirmation is off, so signup logs you straight in.
async function refreshAuth() {
  var res = await sb.auth.getSession();
  currentUser = (res.data && res.data.session) ? res.data.session.user : null;
  updateProfileBar();
}
function setAuthTab(tab) {
  $("tab-login").classList.toggle("active", tab === "login");
  $("tab-signup").classList.toggle("active", tab === "signup");
  $("login-form").classList.toggle("hidden", tab !== "login");
  $("signup-form").classList.toggle("hidden", tab !== "signup");
  $("auth-error").classList.add("hidden");
}
$("tab-login").addEventListener("click", function() { setAuthTab("login"); });
$("tab-signup").addEventListener("click", function() { setAuthTab("signup"); });

$("login-btn").addEventListener("click", async function() {
  var email = $("login-email").value.trim().toLowerCase();
  var pw = $("login-password").value;
  var err = $("auth-error"); err.classList.add("hidden");
  var res = await sb.auth.signInWithPassword({ email: email, password: pw });
  if (res.error) { err.textContent = res.error.message; err.classList.remove("hidden"); return; }
  currentUser = res.data.user;
  await afterLogin("Welcome back, " + displayName(currentUser) + "!");
});
$("signup-btn").addEventListener("click", async function() {
  var name = $("signup-name").value.trim();
  var email = $("signup-email").value.trim().toLowerCase();
  var pw = $("signup-password").value;
  var err = $("auth-error"); err.classList.add("hidden");
  if (!name) { err.textContent = "Add your name."; err.classList.remove("hidden"); return; }
  if (!email) { err.textContent = "Add your email."; err.classList.remove("hidden"); return; }
  if (pw.length < 6) { err.textContent = "Password needs at least 6 characters."; err.classList.remove("hidden"); return; }
  var res = await sb.auth.signUp({ email: email, password: pw, options: { data: { display_name: name } } });
  if (res.error) { err.textContent = res.error.message; err.classList.remove("hidden"); return; }
  currentUser = res.data.user;
  await afterLogin("Welcome, " + name + "!");
});
async function afterLogin(msg) {
  updateProfileBar();
  await migrateLocalPins();
  await loadFeed();
  showView("feed-view");
  showToast(msg);
}
async function migrateLocalPins() {
  // One-time move: pins posted on this phone before the public switch go online under your name.
  var local = [];
  try { local = JSON.parse(localStorage.getItem("pins") || "[]"); } catch (e) { local = []; }
  if (!currentUser || !local.length) { return; }
  var moved = 0;
  for (var i = 0; i < local.length; i++) {
    var p = local[i];
    var row = pinToDb({
      title: p.title || "Untitled", description: p.description || "", link: p.link || "",
      category: p.category || "Other", topics: p.topics || [],
      boardId: null, board_private: false, image: p.image || (p.media && p.media[0] ? p.media[0].url : ""),
      media: p.media || [], layout: p.layout || "single", product: p.product || null,
      commentsAllowed: p.commentsAllowed !== false
    }, currentUser);
    var ins = await sb.from("pins").insert(row);
    if (!ins.error) { moved++; }
  }
  localStorage.removeItem("pins");
  localStorage.removeItem("pinboards");
  if (moved) { showToast("Moved " + moved + " pin" + (moved === 1 ? "" : "s") + " from this phone online."); }
}

function updateProfileBar() {
  var u = currentUser;
  $("profile-bar-logged-in").classList.toggle("hidden", !u);
  $("profile-bar-logged-out").classList.toggle("hidden", !!u);
  if (!u) { return; }
  $("profile-avatar").textContent = (displayName(u) || "?").slice(0, 1).toUpperCase();
  $("profile-greeting").textContent = "Hi, " + displayName(u) + "!";
}
function renderProfile() {
  var u = currentUser; if (!u) { showView("auth-view"); return; }
  $("profile-avatar-big").textContent = (displayName(u) || "?").slice(0, 1).toUpperCase();
  $("profile-name").textContent = displayName(u);
  $("profile-email").textContent = u.email || "";
  var mine = pins.filter(function(p) { return p.user_id === u.id; });
  var myBoards = boards.filter(function(b) { return b.user_id === u.id; });
  $("profile-stats").textContent = mine.length + " pins • " + myBoards.length + " boards • " + savedIds.size + " saved";
  $("profile-edit-name").value = displayName(u);
  $("notifications-toggle").checked = localStorage.getItem("pinboard-notifications") !== "off";
}
$("profile-open").addEventListener("click", function() { renderProfile(); showView("profile-view"); });
$("profile-back").addEventListener("click", function() { showView("feed-view"); renderFeed(); });
$("login-open-btn").addEventListener("click", function() { setAuthTab("login"); showView("auth-view"); });
$("logout-btn").addEventListener("click", async function() {
  await sb.auth.signOut(); currentUser = null; updateProfileBar(); await loadFeed();
  showView("feed-view"); showToast("Logged out.");
});
$("profile-save-name").addEventListener("click", async function() {
  var u = currentUser; if (!u) { return; }
  var name = $("profile-edit-name").value.trim(); if (!name) { return; }
  var res = await sb.auth.updateUser({ data: { display_name: name } });
  if (res.error) { showToast("Could not save: " + res.error.message); return; }
  currentUser = res.data.user;
  updateProfileBar(); renderProfile(); showToast("Name updated. New pins will use it.");
});
$("notifications-toggle").addEventListener("change", function() {
  localStorage.setItem("pinboard-notifications", $("notifications-toggle").checked ? "on" : "off");
  showToast($("notifications-toggle").checked ? "Notifications on." : "Notifications off.");
});

// ---------- Gate: public feed first; login only needed to post ----------
async function gate() {
  await refreshAuth();
  await loadFeed();
  showView("feed-view");
}
gate();
