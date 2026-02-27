const API = "https://sikkerchat-p2-1.onrender.com/";
const POLL_MS = 3000;

const els = {
  username: document.getElementById("username"),
  themeToggle: document.getElementById("themeToggle"),
  messages: document.getElementById("messages"),
  status: document.getElementById("status"),
  composer: document.getElementById("composer"),
  input: document.getElementById("messageInput"),
  roomList: document.getElementById("roomList"),
  newRoomForm: document.getElementById("newRoomForm"),
  newRoomInput: document.getElementById("newRoomInput"),
};

let currentRoom = "Prototype";
let isFetching = false;
let pollTimer = null;

// --- Theme handling ---
(function initTheme(){
  const saved = localStorage.getItem("theme") || "dark";
  if(saved === "light") document.documentElement.classList.add("light");
  els.themeToggle.addEventListener("click", () => {
    document.documentElement.classList.toggle("light");
    localStorage.setItem("theme",
      document.documentElement.classList.contains("light") ? "light" : "dark"
    );
  });
})();

// --- Username persistence ---
(function initUsername(){
  els.username.value = localStorage.getItem("username") || "";
  els.username.addEventListener("change", () => {
    localStorage.setItem("username", els.username.value.trim());
  });
})();

// --- Room list rendering and interaction ---
function renderRoomList(rooms) {
  els.roomList.innerHTML = rooms
    .map(r => `<li class="room${r === currentRoom ? " active" : ""}" data-room="${r}"># ${escapeHtml(r)}</li>`)
    .join("");
}

// click handler for switching rooms
els.roomList.addEventListener("click", (e) => {
  const li = e.target.closest(".room");
  if(!li) return;
  document.querySelectorAll(".room").forEach(r => r.classList.remove("active"));
  li.classList.add("active");
  currentRoom = li.dataset.room;
  fetchMessages(true);
});

// handle creating a new room
els.newRoomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = els.newRoomInput.value.trim();
  if(!name) return;
  try {
    setStatus("Opretter rum…");
    await apiPost("/rooms", { room: name });
    els.newRoomInput.value = "";
    currentRoom = name;
    await loadRooms();
    await fetchMessages(true);
    setStatus("Rum oprettet ✔");
  } catch (err) {
    console.error(err);
    setStatus("Kunne ikke oprette rum", true);
  }
});

// --- Composer submit ---
els.composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const sender = (els.username.value || "Anon").trim();
  const text = els.input.value.trim();
  if(!text) return;

  try{
    setStatus("Sender…");
    await apiPost("/messages", {
      sender,
      // midlertidigt sender vi plaintext i ciphertext-feltet (E2EE kommer senere)
      ciphertext: text,
      room: currentRoom
    });
    els.input.value = "";
    await fetchMessages(true);
    setStatus("Sendt ✔");
  }catch(err){
    console.error(err);
    setStatus("Kunne ikke sende besked", true);
  }
});

// --- Fetch messages loop ---
async function fetchMessages(scrollToEnd=false){
  if(isFetching) return;
  isFetching = true;
  try{
    setStatus("Opdaterer…");
    // request only the current room's messages from the server
    const msgs = await apiGet(`/messages?room=${encodeURIComponent(currentRoom)}`);
    renderMessages(msgs, scrollToEnd);
    setStatus("Forbundet ✔");
  }catch(err){
    console.error(err);
    setStatus("Forbindelsesfejl", true);
  }finally{
    isFetching = false;
  }
}

function renderMessages(msgs, scrollToEnd=false){
  // (Valgfrit) filtrer per room, hvis du gemmer room i backend
  const filtered = msgs.filter(m => !m.room || m.room === currentRoom);

  els.messages.innerHTML = filtered.map(m => {
    const me = (els.username.value || "Anon").trim();
    const isMe = m.sender === me;
    const time = new Date((m.timestamp || Date.now()) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const safeText = escapeHtml(m.ciphertext ?? "");
    const safeSender = escapeHtml(m.sender ?? "Ukendt");
    return `
      <article class="message ${isMe ? "me" : ""}">
        <div class="meta">
          <span><strong>${safeSender}</strong></span>
          <span>·</span>
          <time>${time}</time>
        </div>
        <div class="text">${safeText}</div>
      </article>
    `;
  }).join("");

  if(scrollToEnd){
    els.messages.scrollTop = els.messages.scrollHeight;
  }else{
    // auto-scroll hvis vi allerede er tæt på bunden
    const atBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 40;
    if(atBottom) els.messages.scrollTop = els.messages.scrollHeight;
  }
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text, isError=false){
  els.status.textContent = text;
  els.status.style.color = isError ? "var(--danger)" : "var(--text-dim)";
}

// load available rooms from server
async function loadRooms(){
  try{
    const rooms = await apiGet("/rooms");
    // if current room doesn't exist yet (startup), default to first one
    if(!rooms.includes(currentRoom) && rooms.length) currentRoom = rooms[0];
    renderRoomList(rooms);
  }catch(err){
    console.error("Failed to load rooms", err);
  }
}

// --- Simple API wrappers ---
async function apiGet(path){
  const res = await fetch(API + path, { headers: { "Accept": "application/json" }});
  if(!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function apiPost(path, body){
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return res.json();
}

// Start polling and initialise UI
(async function init(){
  await loadRooms();
  await fetchMessages(true);
  pollTimer = setInterval(fetchMessages, POLL_MS);
})();