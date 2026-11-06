// PinBoard — Create Pin (+) workflow. Browser web app, localStorage only.
// Pins: localStorage "pins". Boards: localStorage "pinboards". No cloud upload in this build.

function $(id) { return document.getElementById(id); }
function loadPins() { try { return JSON.parse(localStorage.getItem("pins") || "[]"); } catch (e) { return []; } }
function loadBoards() { try { return JSON.parse(localStorage.getItem("pinboards") || "[]"); } catch (e) { return []; } }
function savePins() { localStorage.setItem("pins", JSON.stringify(pins)); }
function saveBoards() { localStorage.setItem("pinboards", JSON.stringify(boards)); }
function uid() { return "id-" + Date.now() + "-" + Math.floor(Math.random() * 100000); }
function showToast(msg) { var t = $("toast"); t.textContent = msg; t.classList.remove("hidden"); setTimeout(function() { t.classList.add("hidden"); }, 2500); }
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

var pins = loadPins();
var boards = loadBoards();
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
  card.innerHTML = mediaHtml + "<h3>" + escapeHtml(pin.title) + "</h3><p>" + escapeHtml(pin.category || "") + "</p>" +
    (pin.link ? '<p><a href="' + escapeHtml(pin.link) + '" target="_blank">Open link ↗</a></p>' : "") +
    "<button type=\"button\">Delete</button>";
  card.addEventListener("click", function(e) { if (e.target.tagName !== "BUTTON" && e.target.tagName !== "A") { openPin(pin.id); } });
  card.querySelector("button").addEventListener("click", function(e) {
    e.stopPropagation();
    if (window.confirm("Delete this pin?")) { pins = pins.filter(function(p) { return p.id !== pin.id; }); savePins(); renderFeed(); }
  });
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
// First paint happens in gate() at the end of this file (login first, feed after).

$("search").addEventListener("input", function() { currentSearch = $("search").value.trim().toLowerCase(); renderFeed(); });
$("search-button").addEventListener("click", function() { currentSearch = $("search").value.trim().toLowerCase(); renderFeed(); });
document.querySelectorAll("#filters button").forEach(function(btn) {
  btn.addEventListener("click", function() { currentCategory = btn.dataset.category; renderFeed(); });
});

// ---------- Plus menu ----------
$("plus-button").addEventListener("click", function() { openSheet("plus-sheet"); });
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
$("media-input").addEventListener("change", function() {
  var files = Array.prototype.slice.call($("media-input").files || []);
  $("picker-cancelled").classList.add("hidden");
  if (!files.length) { if (mediaItems.length === 0) { $("picker-cancelled").classList.remove("hidden"); } return; }
  var remaining = files.length, failed = 0;
  files.forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function() {
      mediaItems.push({ type: file.type.indexOf("video") === 0 ? "video" : "image", url: reader.result, name: file.name, selected: true, editor: newEditor() });
      remaining--; if (remaining === 0) { renderPicker(); }
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
  var filtered = boards.filter(function(b) { return !q || b.name.toLowerCase().indexOf(q) !== -1; });
  filtered.forEach(function(b) {
    var firstPin = pins.find(function(p) { return p.boardId === b.id; });
    var thumb = firstPin && firstPin.image ? '<img src="' + firstPin.image + '" alt="">' : b.name.slice(0, 1).toUpperCase();
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "board-item";
    btn.innerHTML = '<span class="board-thumb">' + thumb + '</span><span class="menu-text"><strong>' + escapeHtml(b.name) + '</strong><small>' + boardCount(b.id) + " pins" + (b.private ? " • Private" : " • Public") + "</small></span><span class=\"menu-arrow\">›</span>";
    btn.addEventListener("click", function() {
      if (boardSheetMode === "change-board" && currentPinId) {
        var pin = pins.find(function(p) { return p.id === currentPinId; });
        if (pin) { pin.boardId = b.id; pin.category = pin.category; savePins(); renderFeed(); renderPinView(); showToast("Board changed."); }
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
$("board-create-save").addEventListener("click", function() {
  var name = $("board-name").value.trim(); var err = $("board-create-error"); err.classList.add("hidden");
  if (!name) { err.textContent = "Board name is required."; err.classList.remove("hidden"); return; }
  var board = { id: uid(), name: name, private: $("board-private").checked, createdAt: new Date().toISOString() };
  boards.push(board); saveBoards(); $("board-name").value = ""; $("board-private").checked = false;
  if (boardSheetMode === "change-board" && currentPinId) {
    var pin = pins.find(function(p) { return p.id === currentPinId; });
    if (pin) { pin.boardId = board.id; savePins(); renderFeed(); renderPinView(); }
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
  var timer = setInterval(function() {
    percent += 5;
    if (percent > 100) { percent = 100; }
    $("publish-progress-bar").style.width = percent + "%";
    $("publish-progress-text").textContent = percent + "%";
    if (percent >= 100) {
      clearInterval(timer);
      try {
        var pin = {
          id: uid(), title: title, description: $("detail-description").value.trim(), link: $("detail-link").value.trim(),
          category: selectedTopics[0] || "Other", topics: selectedTopics.slice(), boardId: selectedBoardId,
          image: sel[0].url, media: sel.map(function(m) { return { type: m.type, url: m.url, editor: m.editor }; }),
          layout: flowMode === "collage" ? "collage" : "single",
          product: $("product-toggle").checked ? { name: $("product-name").value.trim(), link: $("product-link").value.trim() } : null,
          commentsAllowed: $("comments-allowed").checked, saved: false, createdAt: new Date().toISOString()
        };
        pins.push(pin); savePins();
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
  $("pin-content").innerHTML = mediaHtml + "<h3>" + escapeHtml(pin.title) + "</h3><p>" + escapeHtml(pin.description || "") + "</p><p class=\"muted\">" + escapeHtml(pin.category || "") + (board ? " • Board: " + escapeHtml(board.name) : "") + (pin.topics && pin.topics.length ? " • " + escapeHtml(pin.topics.join(", ")) : "") + "</p>" + (pin.link ? '<p><a href="' + escapeHtml(pin.link) + '" target="_blank">Open link ↗</a></p>' : "");
  $("pin-save-toggle").textContent = pin.saved ? "Saved ✓" : "Save";
  $("pin-open-link").style.display = pin.link ? "" : "none";
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
$("pin-edit-save").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; }); if (!pin) { return; }
  pin.title = $("pin-edit-title").value.trim() || pin.title; pin.description = $("pin-edit-description").value.trim();
  savePins(); $("pin-edit-form").classList.add("hidden"); renderPinView(); renderFeed(); showToast("Pin updated.");
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
  pin.saved = !pin.saved; savePins(); renderPinView(); showToast(pin.saved ? "Saved." : "Unsaved.");
});
$("pin-delete").addEventListener("click", function() {
  if (!window.confirm("Delete this pin? This cannot be undone.")) { return; }
  pins = pins.filter(function(p) { return p.id !== currentPinId; }); savePins(); renderFeed(); showView("feed-view");
});
$("pin-open-link").addEventListener("click", function() {
  var pin = pins.find(function(p) { return p.id === currentPinId; });
  if (pin && pin.link) { window.open(pin.link, "_blank"); }
});

// ---------- Local-only login (same keys as the VS Code app: pinboard-users, pinboard-session) ----------
// This login lives only on this device. It does NOT make pins visible to other people —
// pins are still saved in this browser only until a shared database is added.
function loadUsers() { try { return JSON.parse(localStorage.getItem("pinboard-users") || "[]"); } catch (e) { return []; } }
function saveUsers(u) { localStorage.setItem("pinboard-users", JSON.stringify(u)); }
function currentUser() { try { return JSON.parse(localStorage.getItem("pinboard-session") || "null"); } catch (e) { return null; } }
function setSession(u) { if (u) { localStorage.setItem("pinboard-session", JSON.stringify(u)); } else { localStorage.removeItem("pinboard-session"); } }

function setAuthTab(tab) {
  $("tab-login").classList.toggle("active", tab === "login");
  $("tab-signup").classList.toggle("active", tab === "signup");
  $("login-form").classList.toggle("hidden", tab !== "login");
  $("signup-form").classList.toggle("hidden", tab !== "signup");
  $("auth-error").classList.add("hidden");
}
$("tab-login").addEventListener("click", function() { setAuthTab("login"); });
$("tab-signup").addEventListener("click", function() { setAuthTab("signup"); });

$("login-btn").addEventListener("click", function() {
  var email = $("login-email").value.trim().toLowerCase();
  var pw = $("login-password").value;
  var err = $("auth-error"); err.classList.add("hidden");
  var u = loadUsers().find(function(x) { return x.email === email; });
  if (!u || u.password !== pw) { err.textContent = "Wrong email or password."; err.classList.remove("hidden"); return; }
  setSession(u); updateProfileBar(); renderFeed(); showView("feed-view"); showToast("Welcome back, " + u.name + "!");
});
$("signup-btn").addEventListener("click", function() {
  var name = $("signup-name").value.trim();
  var email = $("signup-email").value.trim().toLowerCase();
  var pw = $("signup-password").value;
  var err = $("auth-error"); err.classList.add("hidden");
  if (!name) { err.textContent = "Add your name."; err.classList.remove("hidden"); return; }
  if (!email) { err.textContent = "Add your email."; err.classList.remove("hidden"); return; }
  if (pw.length < 4) { err.textContent = "Password needs at least 4 characters."; err.classList.remove("hidden"); return; }
  var users = loadUsers();
  if (users.some(function(x) { return x.email === email; })) { err.textContent = "That email already has an account — log in instead."; err.classList.remove("hidden"); return; }
  var u = { name: name, email: email, password: pw };
  users.push(u); saveUsers(users); setSession(u);
  updateProfileBar(); renderFeed(); showView("feed-view"); showToast("Welcome, " + name + "!");
});

function updateProfileBar() {
  var u = currentUser(); if (!u) { return; }
  $("profile-avatar").textContent = (u.name || "?").slice(0, 1).toUpperCase();
  $("profile-greeting").textContent = "Hi, " + u.name + "!";
}
function renderProfile() {
  var u = currentUser(); if (!u) { showView("auth-view"); return; }
  $("profile-avatar-big").textContent = (u.name || "?").slice(0, 1).toUpperCase();
  $("profile-name").textContent = u.name;
  $("profile-email").textContent = u.email;
  var saved = pins.filter(function(p) { return p.saved; }).length;
  $("profile-stats").textContent = pins.length + " pins • " + boards.length + " boards • " + saved + " saved";
  $("profile-edit-name").value = u.name;
  $("notifications-toggle").checked = localStorage.getItem("pinboard-notifications") !== "off";
}
$("profile-open").addEventListener("click", function() { renderProfile(); showView("profile-view"); });
$("profile-back").addEventListener("click", function() { showView("feed-view"); renderFeed(); });
$("logout-btn").addEventListener("click", function() { setSession(null); showView("auth-view"); showToast("Logged out."); });
$("profile-save-name").addEventListener("click", function() {
  var u = currentUser(); if (!u) { return; }
  var name = $("profile-edit-name").value.trim(); if (!name) { return; }
  var users = loadUsers();
  var rec = users.find(function(x) { return x.email === u.email; });
  if (rec) { rec.name = name; saveUsers(users); }
  u.name = name; setSession(u); updateProfileBar(); renderProfile(); showToast("Name updated.");
});
$("notifications-toggle").addEventListener("change", function() {
  localStorage.setItem("pinboard-notifications", $("notifications-toggle").checked ? "on" : "off");
  showToast($("notifications-toggle").checked ? "Notifications on." : "Notifications off.");
});
$("profile-delete").addEventListener("click", function() {
  var u = currentUser(); if (!u) { return; }
  if (!window.confirm("Delete your account on this device? Your pins stay on this device, but this login is gone.")) { return; }
  saveUsers(loadUsers().filter(function(x) { return x.email !== u.email; }));
  setSession(null); showView("auth-view"); showToast("Account deleted.");
});

// ---------- Gate: login screen first, feed only after login ----------
function gate() {
  var u = currentUser();
  if (!u) { setAuthTab("login"); showView("auth-view"); return; }
  updateProfileBar(); renderFeed(); showView("feed-view");
}
gate();
