const API = "http://localhost:5000";  // Changed to local server
const POLL_MS = 3000;

const els = {
  username: document.getElementById("username"),
  themeToggle: document.getElementById("themeToggle"),
  messages: document.getElementById("messages"),
  status: document.getElementById("status"),
  composer: document.getElementById("composer"),
  input: document.getElementById("messageInput"),
  roomList: document.getElementById("roomList"),
};

let currentRoom = null;
let token = localStorage.getItem("token");
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

// --- Auth handling ---
async function ensureAuth() {
  if (!token) {
    const action = prompt("Enter 'login' or 'register'");
    const username = prompt("Username:");
    const password = prompt("Password:");
    try {
      const res = await apiPost(`/${action}`, { username, password });
      token = res.token;
      localStorage.setItem("token", token);
      localStorage.setItem("username", username);
      els.username.value = username;
    } catch (err) {
      alert("Auth failed: " + err.message);
      return false;
    }
  }
  return true;
}

// --- Room handling ---
async function loadRooms() {
  try {
    const rooms = await apiGet("/rooms");
    els.roomList.innerHTML = rooms.groups.map(room => `<li class="room" data-room="${room}">${room}</li>`).join("");
    if (!currentRoom && rooms.groups.length > 0) {
      currentRoom = rooms.groups[0];
      document.querySelector(`[data-room="${currentRoom}"]`).classList.add("active");
    }
  } catch (err) {
    console.error("Failed to load rooms:", err);
  }
}

// --- Room selection ---
els.roomList.addEventListener("click", (e) => {
  const li = e.target.closest(".room");
  if(!li) return;
  document.querySelectorAll(".room").forEach(r => r.classList.remove("active"));
  li.classList.add("active");
  currentRoom = li.dataset.room;
  fetchMessages(true);
});

// --- Composer submit ---
els.composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!await ensureAuth() || !currentRoom) return;
  const text = els.input.value.trim();
  if(!text) return;

  try{
    setStatus("Sender…");
    await apiPost("/messages", {
      ciphertext: text,  // Placeholder for E2EE
      group: currentRoom,
      temp_token: token
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
  if(isFetching || !currentRoom) return;
  isFetching = true;
  try{
    setStatus("Opdaterer…");
    const msgs = await apiGet(`/messages?group=${encodeURIComponent(currentRoom)}`);
    renderMessages(msgs.messages, scrollToEnd);
    setStatus("Forbundet ✔");
  }catch(err){
    console.error(err);
    setStatus("Forbindelsesfejl", true);
  }finally{
    isFetching = false;
  }
}

function renderMessages(msgs, scrollToEnd=false){
  els.messages.innerHTML = msgs.map(m => {
    const me = localStorage.getItem("username") || "Anon";
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

// --- Simple API wrappers ---
async function apiGet(path){
  const res = await fetch(API + path, { 
    headers: { 
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: token ? JSON.stringify({ temp_token: token }) : undefined
  });
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

// Start app
(async function init(){
  if (await ensureAuth()) {
    await loadRooms();
    await fetchMessages(true);
    pollTimer = setInterval(fetchMessages, POLL_MS);
  }
})();