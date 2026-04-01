// Popup UI logic — communicates with background.js via chrome.runtime.sendMessage

function updateUI() {
  chrome.runtime.sendMessage({ type: "getStatus" }, (status) => {
    if (!status) return;

    const info = document.getElementById("info");
    const urlEl = document.getElementById("url");
    const coffeeBtn = document.getElementById("coffeeBtn");

    if (status.coffeeActive) {
      info.innerHTML = "<b>Coffee break active</b>";
      urlEl.textContent = "Paused";
      urlEl.className = "url coffee";
      coffeeBtn.classList.add("active");
      coffeeBtn.textContent = "\u2615 End Break";
    } else {
      info.innerHTML =
        "Page <b>" +
        (status.rotationIndex + 1) +
        "/" +
        status.totalUrls +
        "</b> | Interval: <b>" +
        status.intervalSeconds +
        "s</b>";
      urlEl.textContent = status.currentUrl || "(none)";
      urlEl.className = "url";
      coffeeBtn.classList.remove("active");
      coffeeBtn.textContent = "\u2615 Coffee";
    }
  });
}

document.getElementById("prevBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "prevPage" }, () => updateUI());
});

document.getElementById("nextBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "nextPage" }, () => updateUI());
});

document.getElementById("coffeeBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "toggleCoffee" }, () => updateUI());
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "refreshConfig" }, () => {
    document.getElementById("info").innerHTML =
      "<b style='color:#4caf50'>Config refreshed!</b>";
    setTimeout(updateUI, 1500);
  });
});

// Initial load
updateUI();
