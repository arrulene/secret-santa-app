const proxyBase = "http://localhost:3000"; // proxy server URL

let currentUser, assignedUser;
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
function handleLogin() {
  const email = document.getElementById("email").value.trim();
  const code = document.getElementById("code").value.trim();
  if (!email || !code) { 
    alert("Enter both email and login code"); 
    return; 
  }

  const loader = document.getElementById("loader");
  document.body.style.overflow = "hidden"; // lock scrolling
  loader.style.display = "block";

  fetch(`${proxyBase}/loginUser?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`)
    .then(res => res.json())
    .then(res => {
      if (res.status !== "ok") {
        loader.style.display = "none";
        document.body.style.overflow = "auto";
        alert(res.message);
        return;
      }

      currentUser = res.user;
      assignedUser = res.assigned;

      fetch(`${proxyBase}/getUser?email=${encodeURIComponent(currentUser.Email)}`)
        .then(res => res.json())
        .then(userData => {
          loader.style.display = "none";
          document.body.style.overflow = "auto";
          //currentUser.FirstLogin = userData.FirstLogin || false;
          loadDashboard();
        })
        .catch(err => {
          loader.style.display = "none";
          document.body.style.overflow = "auto";
          console.error("Error fetching user data:", err);
          currentUser.FirstLogin = false; // fallback
          loadDashboard();
        });
    })
    .catch(err => {
      loader.style.display = "none";
      document.body.style.overflow = "auto";
      alert("Error connecting to server: " + err.message);
    });
}

// --- Dashboard / Reveal ---
async function loadDashboard() {
  const assignedNameReveal = document.getElementById("assignedNameReveal");
  const continueBtn = document.getElementById("continueButton");

  const isFirstLogin = currentUser.FirstLogin === true;

  if (isFirstLogin) {
    showScreen("revealScreen");
    assignedNameReveal.textContent = assignedUser.Name;

    // Confetti
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

    continueBtn.onclick = async () => {
      // Disable button to prevent multiple clicks
      continueBtn.disabled = true;

      // Remove confetti smoothly
      const confettiPieces = document.querySelectorAll(".confetti-piece");
      confettiPieces.forEach(el => el.remove());

      showScreen("dashboard");

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

      // Load dashboard content
      initDashboardContent();
    };

  } else {
    showScreen("dashboard");
    initDashboardContent();
  }
}

// --- Dashboard content ---
function initDashboardContent() {
  document.getElementById("userName").textContent = currentUser.Name;
  document.getElementById("myWishlist").value = currentUser.Wishlist || "";
  document.getElementById("assignedName").textContent = assignedUser.Name;
  document.getElementById("assignedNameWishlist").textContent = assignedUser.Name;
  document.getElementById("assignedNameChat").textContent = assignedUser.Name;

  startPolling();
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
    if (res.status === "ok") alert("Wishlist saved!");
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

// --- Fetch & Render Chats ---
function fetchChats() {
  // Assigned Person Chat
  fetch(`${proxyBase}/readChat?thread=${currentUser.Email}_to_${assignedUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const chatDiv = document.getElementById("chatAssigned");
      const messages = res.messages || [];
      if (JSON.stringify(messages) !== JSON.stringify(lastAssignedChatsAssigned)) {
        chatDiv.innerHTML = ""; // clear old messages
        messages.forEach(m => {
          const msg = document.createElement("div");
          const isMe = m.FromEmail === currentUser.Email;
          msg.classList.add("message", isMe ? "sent" : "received");
          msg.textContent = m.Message;
          chatDiv.appendChild(msg);
        });
        chatDiv.scrollTop = chatDiv.scrollHeight; // scroll to bottom
        lastAssignedChatsAssigned = messages;
      }
    });

  // Secret Santa Chat
  fetch(`${proxyBase}/readChat?thread=${assignedUser.Email}_to_${currentUser.Email}`)
    .then(res => res.json())
    .then(res => {
      const chatDiv = document.getElementById("chatSanta");
      const messages = res.messages || [];
      if (JSON.stringify(messages) !== JSON.stringify(lastAssignedChatsSanta)) {
        chatDiv.innerHTML = "";
        messages.forEach(m => {
          const isMe = m.FromEmail === currentUser.Email; // in case current user can also reply
          const msg = document.createElement("div");
          msg.classList.add("message", isMe ? "sent" : "received");
          msg.textContent = m.Message;
          chatDiv.appendChild(msg);
        });
        chatDiv.scrollTop = chatDiv.scrollHeight;
        lastAssignedChatsSanta = messages;
      }
    });
}

// --- Send Chat ---
function sendChat(type) {
  let toEmail, msgInput, chatDiv; fromEmail
  if (type === "assigned") {
    toEmail = assignedUser.Email;
    fromEmail = currentUser.Email;
    msgInput = document.getElementById("chatAssignedInput");
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    toEmail = currentUser.AssignedTo || assignedUser.Email; // your Secret Santa
    fromEmail = currentUser.Email
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
    body: JSON.stringify({ threadID: fromEmail + "_to_" + toEmail, from: currentUser.Email, to: toEmail, message: messageText })
  })
  .then(fetchChats) // refresh chats from backend to get any new messages
  .catch(err => console.error("Error sending chat:", err));
}

// --- Polling ---
function startPolling() {
  const dashboardVisible = document.getElementById("dashboard").style.display === "block";
  if (dashboardVisible) {
    fetchAssignedWishlist();
    fetchChats();
  }
  setTimeout(startPolling, 3000);
}
