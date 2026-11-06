const form = document.getElementById("pin-form");
const grid = document.getElementById("grid");
const searchInput = document.getElementById("search");
const searchButton = document.getElementById("search-button");
const savedPins = JSON.parse(localStorage.getItem("pins") || "[]");

let currentSearch = "";
let currentCategory = "All";

function renderPins() {
  grid.innerHTML = "";

  savedPins.forEach(function(savedPin, index) {
    if (currentCategory !== "All" && savedPin.category !== currentCategory) {
      return;
    }
    if (currentSearch && savedPin.title.toLowerCase().indexOf(currentSearch) === -1) {
      return;
    }

    const pin = document.createElement("div");
    pin.innerHTML = `<img src="${savedPin.image}" alt="Pin photo"><h3>${savedPin.title}</h3><p>${savedPin.category || ""}</p><button>Delete</button>`;

    const deleteButton = pin.querySelector("button");
    deleteButton.addEventListener("click", function() {
      savedPins.splice(index, 1);
      localStorage.setItem("pins", JSON.stringify(savedPins));
      renderPins();
    });

    grid.appendChild(pin);
  });
}

function saveAndShow(title, image, category) {
  savedPins.push({ title: title, image: image, category: category });
  localStorage.setItem("pins", JSON.stringify(savedPins));
  renderPins();
}

renderPins();

if (searchInput) {
  searchInput.addEventListener("input", function() {
    currentSearch = searchInput.value.trim().toLowerCase();
    renderPins();
  });
}

if (searchButton) {
  searchButton.addEventListener("click", function() {
    currentSearch = searchInput.value.trim().toLowerCase();
    renderPins();
  });
}

document.querySelectorAll("#filters button").forEach(function(button) {
  button.addEventListener("click", function() {
    currentCategory = button.dataset.category;
    renderPins();
  });
});

form.addEventListener("submit", function(event) {
  event.preventDefault();

  const title = document.getElementById("title").value.trim();
  const imageUrl = document.getElementById("image").value.trim();
  const photoFile = document.getElementById("photo").files[0];
  const category = document.getElementById("category").value;

  if (!title) {
    return;
  }

  if (photoFile) {
    const reader = new FileReader();
    reader.onload = function() {
      saveAndShow(title, reader.result, category);
      form.reset();
    };
    reader.readAsDataURL(photoFile);
  } else if (imageUrl) {
    saveAndShow(title, imageUrl, category);
    form.reset();
  }
});
