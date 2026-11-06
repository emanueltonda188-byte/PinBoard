// PinBoard — Create Pin (+) workflow. Public shared pins via Supabase.
// Pins + boards live in the pesalink Supabase project (tables pins, boards).
// Anyone can view the feed; posting needs a real account (Supabase Auth).
// Local storage keeps only: offline pin cache ("pins-cache"), saved pin ids ("pinboard-saved"), notification pref.
const SUPABASE_URL = "https://baucxuimppcajcafdsqx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhdWN4dWltcHBjYWpjYWZkc3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMDU5MzMsImV4cCI6MjEwODg4MTkzM30.RFUIyH8tSGoQodpCEdijiisXJniUwsZYpmUF_KI-u9k";
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

function newEditor() { return { aspect: "original", rotation: 0, text: "", position: "center", color: "#ffffff", size: 24, filter: "none", brightness: 100, contrast: 100, saturation: 100 }; }
function selectedMedia() { return mediaItems.filter(function(m) { return m.selected; }); }
function boardById(id) { return boards.find(function(b) { return b.id === id; }) || null; }
function boardCount(id) { return pins.filter(function(p) { return p.boardId === id; }).length; }

function showView(viewId) {
  ["feed-view", "create-view", "pin-view", "auth-view", "profile-view"].forEach(function(id) { $(id).classList.toggle("active", id === viewId); });
  $("plus-button").classList.toggle("hidden", viewId === "auth-view");
  closeSheets();
  window.scrollTo(0, 0);
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
  card.innerHTML = mediaHtml + "<h3>" + escapeHtml(pin.title) + "</h3><p>" + escapeHtml(pin.category || "") + "</p>" +
    "<p class=\"muted\">by " + escapeHtml(pin.author_name || "PinBoard") + "</p>" +
    (pin.link ? '<p><a href="' + escapeHtml(pin.link) + '" target="_blank">Open link ↗</a></p>' : "") +
    (own ? "<button type=\"button\">Delete</button>" : "");
  card.addEventListener("click", function(e) { if (e.target.tagName !== "BUTTON" && e.target.tagName !== "A") { openPin(pin.id); } });
  var delBtn = card.querySelector("button");
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
  renderFeed();
}
// First paint happens in gate() at the end of this file (public feed first, no login needed).

$("search").addEventListener("input", function() { currentSearch = $("search").value.trim().toLowerCase(); renderFeed(); });
$("search-button").addEventListener("click", function() { currentSearch = $("search").value.trim().toLowerCase(); loadFeed(); });
document.querySelectorAll("#filters button").forEach(function(btn) {
  btn.addEventListener("click", function() { currentCategory = btn.dataset.category; renderFeed(); });
});

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
  if (savedIds.has(pin.id)) { savedIds.delete(pin.id); } else { savedIds.add(pin.id); }
  saveSavedIds(); pin.saved = savedIds.has(pin.id); renderPinView(); showToast(pin.saved ? "Saved." : "Unsaved.");
});
$("pin-delete").addEventListener("click", async function() {
  if (!window.confirm("Delete this pin? This cannot be undone.")) { return; }
  var del = await sb.from("pins").delete().eq("id", currentPinId);
  if (del.error) { showToast("Could not delete: " + del.error.message); return; }
  pins = pins.filter(function(p) { return p.id !== currentPinId; }); saveCache(); renderFeed(); showView("feed-view");
});
$("pin-open-link").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (pin && pin.link) { window.open(pin.link, "_blank"); }
});

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
