const form = document.getElementById("pin-form");
const boards = JSON.parse(localStorage.getItem("pinboards") || "[]");
const boardSelect = document.getElementById("board");

boards.forEach(function(board) {
  const option = document.createElement("option");
  option.value = board.name;
  option.textContent = board.name;
  boardSelect.appendChild(option);
});

const pendingImage = sessionStorage.getItem("pendingPinImage");
if (pendingImage) {
  const preview = document.getElementById("pending-preview");
  preview.src = pendingImage;
  preview.style.display = "block";
  sessionStorage.removeItem("pendingPinImage");
}

form.addEventListener("submit", function(event) {
  event.preventDefault();

  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const category = document.getElementById("category").value;
  const board = document.getElementById("board").value || null;
  const imageUrl = document.getElementById("image").value.trim();
  const photoFile = document.getElementById("photo").files[0];
  const link = document.getElementById("link").value.trim();

  if (!title) {
    return;
  }

  function saveAndGo(image) {
    const savedPins = JSON.parse(localStorage.getItem("pins") || "[]");
    savedPins.push({ title: title, description: description, image: image, category: category, board: board, link: link });
    localStorage.setItem("pins", JSON.stringify(savedPins));
    sessionStorage.setItem("justUploaded", "true");
    window.location.href = "index.html";
  }

  if (photoFile) {
    const reader = new FileReader();
    reader.onload = function() {
      saveAndGo(reader.result);
    };
    reader.readAsDataURL(photoFile);
  } else if (pendingImage) {
    saveAndGo(pendingImage);
  } else if (imageUrl) {
    saveAndGo(imageUrl);
  }
});
