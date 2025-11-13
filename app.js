const proxyBase = "http://localhost:3000"; // proxy server URL

let currentUser, assignedUser, santaUser;
let lastAssignedWishlist = "";
let lastAssignedChatsAssigned = [];
let lastAssignedChatsSanta = [];


// --- Startup: show loginBox on page load ---
document.addEventListener("DOMContentLoaded", () => {
  showScreen("loginBox");
});

// --- Helper: show one screen at a time ---
function showScreen(screenId) {
  const screens = ["loginBox", "revealScreen", "dashboard"];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === screenId) {
      // Special handling for dashboard to trigger smooth entrance
      if (id === "dashboard") {
        el.style.display = "block"; 
        setTimeout(() => el.classList.add("show"), 20); // small delay to allow transition
      } else {
        el.style.display = (id === "revealScreen") ? "flex" : "block";
        el.classList.remove("show"); // reset in case dashboard is hidden
      }
    } else {
      el.style.display = "none";
      el.classList.remove("show");
    }
  });
}

// --- Login ---
async function handleLogin() {
  const email = document.getElementById("email").value.trim();
  const code = document.getElementById("code").value.trim();
  if (!email || !code) { 
    alert("Enter both email and login code"); 
    return; 
  }

  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loaderText");
  document.body.style.overflow = "hidden"; // lock scrolling
  loader.style.display = "block";
  loaderText.textContent = "Logging you in...";

  try {
    const res = await fetch(`${proxyBase}/loginUser?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`);
    const data = await res.json();

    if (data.status !== "ok") {
      loader.style.display = "none";
      document.body.style.overflow = "auto";
      alert(data.message);
      return;
    }

    currentUser = data.user || { Email: email };
    assignedUser = data.assigned;
    santaUser = data.santa;

    loaderText.textContent = "Loading your dashboard...";

    if (currentUser.Email) {
      const userData = await fetch(`${proxyBase}/getUser?email=${encodeURIComponent(currentUser.Email)}`).then(r => r.json());
      currentUser = { ...currentUser, ...userData }; // Merge additional data
    }

    await loadDashboard();

  } catch (err) {
    alert("Error connecting to server: " + err.message);
    console.error(err);
  } finally {
    document.body.style.overflow = "auto";
    loader.style.display = "none";
  }
}

// --- Dashboard / Reveal ---
async function loadDashboard() {
  const assignedNameReveal = document.getElementById("assignedNameReveal");
  const continueBtn = document.getElementById("continueButton");

  const isFirstLogin = currentUser.FirstLogin === true;

  await initDashboardContent();
  loader.style.display = "none";

  if (isFirstLogin) {
    assignedNameReveal.textContent = assignedUser.Name;
    showScreen("revealScreen");

    createConfetti();

    continueBtn.onclick = async () => {
      // Disable button to prevent multiple clicks
      continueBtn.disabled = true;

      // Remove confetti smoothly
      const confettiPieces = document.querySelectorAll(".confetti-piece");
      confettiPieces.forEach(el => el.remove());

      try {
        const res = await fetch(`${proxyBase}/markFirstLoginComplete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "firstLoginComplete",
            email: currentUser.Email
          })
        });

        const data = await res.json();
        if (data.status === "ok") {
          currentUser.FirstLogin = false;
          console.log("✅ First login marked complete for:", currentUser.Email);
        } else {
          console.warn("⚠️ Failed to mark first login:", data);
        }
      } catch (err) {
        console.error("Error marking first login:", err);
      }

      initDashboard();
    };

  } else {
    initDashboard();
  }
}

// --- Dashboard content ---
async function initDashboardContent() {
  document.getElementById("dashboard").style.display="none";
  document.getElementById("userName").textContent = currentUser.Name;
  document.getElementById("myWishlist").value = currentUser.Wishlist || "";
  document.getElementById("assignedName").textContent = assignedUser.Name;
  document.getElementById("assignedNameWishlist").textContent = assignedUser.Name;
  document.getElementById("assignedNameChat").textContent = assignedUser.Name;

  try {
  
    await Promise.all([
      fetchFullChatHistory("assigned"),
      fetchFullChatHistory("santa")
    ]);

    startPolling("assigned");
    startPolling("santa")

  } catch (err) {
    console.error("Error initializing dashboard:", err);
  }
}

function initDashboard() {
  document.getElementById("dashboard").style.display = "block";
}

// Create Confetti
function createConfetti() {
  document.querySelectorAll(".confetti-piece").forEach(el => el.remove());
  for (let i = 0; i < 25; i++) {
    const confetti = document.createElement("div");
    confetti.classList.add("confetti-piece");
    confetti.style.top = "-10px";
    confetti.style.left = `${Math.random() * 100}vw`;
    confetti.style.width = `${6 + Math.random() * 6}px`;
    confetti.style.height = confetti.style.width;
    confetti.style.borderRadius = "50%";
    confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
    confetti.style.zIndex = 10000;
    confetti.style.animationDuration = `${2 + Math.random() * 3}s`;
    document.body.appendChild(confetti);
  }
}

// --- Wishlist ---
function saveWishlist() {
  const wishlist = document.getElementById("myWishlist").value;
  fetch(`${proxyBase}/writeWishlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "wishlist", email: currentUser.Email, wishlist })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === "ok"); // alert("Wishlist saved!");
  });
}

function fetchAssignedWishlist() {
  fetch(`${proxyBase}/readParticipants?email=${currentUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const assignedDiv = document.getElementById("assignedWishlist");
      const newWishlist = res.assigned?.Wishlist || "";

      if (lastAssignedWishlist !== newWishlist) {
        if (lastAssignedWishlist) {
          assignedDiv.classList.add("highlight");
          setTimeout(() => assignedDiv.classList.remove("highlight"), 1000);
        }
        assignedDiv.textContent = newWishlist;
        lastAssignedWishlist = newWishlist;
      }
    });
}

let lastMessageTimestamps = {
  assigned: 0,
  santa :0,
}

// --- Fetch & Render Chats ---
async function fetchFullChatHistory(type) {
  let fromEmail, toEmail, chatDiv;

  if (type === "assigned") {
    fromEmail = currentUser.Email;
    toEmail = assignedUser.Email;
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    fromEmail = currentUser.Email;
    toEmail = currentUser.SantaEmail; // use Santa column
    chatDiv = document.getElementById("chatSanta");
  }

  const threadA = `${fromEmail}_to_${toEmail}`;
  const threadB = `${toEmail}_to_${fromEmail}`;

  try {
    const [resA, resB] = await Promise.all([
      fetch(`${proxyBase}/readChat?thread=${threadA}`).then(r => r.json()),
      fetch(`${proxyBase}/readChat?thread=${threadB}`).then(r => r.json())
    ]);

    let messages = [...(resA.messages || []), ...(resB.messages || [])];
    messages.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    chatDiv.innerHTML = "";
    messages.forEach(m => {
      const msg = document.createElement("div");
      const isMe = m.FromEmail === currentUser.Email;
      msg.classList.add("message", isMe ? "sent" : "received");
      msg.textContent = m.Message;
      chatDiv.appendChild(msg);
    });
    chatDiv.scrollTop = chatDiv.scrollHeight;

    if (messages.length > 0) {
      lastMessageTimestamps[type] = new Date(messages[messages.length - 1].Timestamp).getTime();
    }

  } catch (err) {
    console.error("Error fetching full chat history:", err);
  }
}

async function fetchNewMessages(type) {
  let fromEmail, toEmail, chatDiv;

  if (type === "assigned") {
    fromEmail = currentUser.Email;
    toEmail = assignedUser.Email;
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    fromEmail = currentUser.Email;
    toEmail = currentUser.SantaEmail;
    chatDiv = document.getElementById("chatSanta");
  }

  const threadA = `${fromEmail}_to_${toEmail}`;
  const threadB = `${toEmail}_to_${fromEmail}`;
  const lastTime = lastMessageTimestamps[type] || 0;

  try {
    const [resA, resB] = await Promise.all([
      fetch(`${proxyBase}/readChat?thread=${threadA}`).then(r => r.json()),
      fetch(`${proxyBase}/readChat?thread=${threadB}`).then(r => r.json())
    ]);

    let messages = [...(resA.messages || []), ...(resB.messages || [])];
    messages = messages.filter(m => new Date(m.Timestamp).getTime() > lastTime);
    messages.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    messages.forEach(m => {
      const msg = document.createElement("div");
      const isMe = m.FromEmail === currentUser.Email;
      msg.classList.add("message", isMe ? "sent" : "received");
      msg.textContent = m.Message;
      chatDiv.appendChild(msg);
    });

    if (messages.length > 0) {
      lastMessageTimestamps[type] = new Date(messages[messages.length - 1].Timestamp).getTime();
      chatDiv.scrollTop = chatDiv.scrollHeight;
    }

  } catch (err) {
    console.error("Error fetching new messages:", err);
  }
}

// --- Send Chat ---
function sendChat(type) {
  let toEmail, msgInput, chatDiv;
  if (type === "assigned") {
    toEmail = assignedUser.Email;
    msgInput = document.getElementById("chatAssignedInput");
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    toEmail = santaUser.Email; // your Secret Santa
    msgInput = document.getElementById("chatSantaInput");
    chatDiv = document.getElementById("chatSanta");
  }

  const messageText = msgInput.value.trim();
  if (!messageText) return;
  msgInput.value = "";

  // Optimistically add message to chat (so it appears instantly)
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", "sent");
  msgDiv.textContent = messageText;
  chatDiv.appendChild(msgDiv);
  chatDiv.scrollTop = chatDiv.scrollHeight;

  // Send to backend
  fetch(`${proxyBase}/writeChat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({type: "chat", from: currentUser.Email, to: toEmail, message: messageText })
  })
  .then(fetchChats) // refresh chats from backend to get any new messages
  .catch(err => console.error("Error sending chat:", err));
}

// --- Polling ---
function startPolling(type) {
  const dashboardVisible = document.getElementById("dashboard").style.display === "block";
  if (dashboardVisible) {
    fetchAssignedWishlist();
    fetchNewMessages(type);
  }
  setTimeout(startPolling, 3000);
}
