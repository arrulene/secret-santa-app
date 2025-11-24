//const proxyBase = "http://localhost:3000"; // proxy server URL

//const proxyBase = "https://script.google.com/macros/s/AKfycbyZDIi_bAfRVUx8wf0CSDlNZra7fF2maG04GgGQU0hSw7SZLmtluP13wcJte3c1KW4x/exec";

let currentUser, assignedUser, santaUser;
let lastAssignedWishlist = "";

// Firestore collection references
const participantsRef = db.collection("participants");
const chatsRef = db.collection("chats");

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
    const snapshot = await participantsRef
      .where("email","==", email)
      .where("loginCode", "==", code)
      .get();

    if (snapshot.empty) {
      throw new Error("Invalid email or code")
    }

    currentUser = snapshot.docs[0].data();

    const assignedSnap = await participantsRef
      .where("name","==",currentUser.assignedTo)
      .get();
    assignedUser = assignedSnap.docs[0]?.data() || {};

    const santaSnap = await participantsRef
      .where("name", "==", currentUser.santa)
      .get();
    santaUser = santaSnap.docs[0]?.data() || {};

    loaderText.textContent = "Loading your dashboard...";

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
  const loader = document.getElementById("loader");

  const isFirstLogin = currentUser.firstLogin === true;

  await initDashboardContent();
  if (loader) loader.style.display = "none";

  if (isFirstLogin) {
    assignedNameReveal.textContent = assignedUser.name;
    showScreen("revealScreen");

    createConfetti();

    continueBtn.onclick = async () => {
      // Disable button to prevent multiple clicks
      continueBtn.disabled = true;

      // Remove confetti smoothly
      const confettiPieces = document.querySelectorAll(".confetti-piece");
      confettiPieces.forEach(el => el.remove());

      try {
        await participantsRef
            .doc(currentUser.email)
            .update({firstLogin: false});
        currentUser.firstLogin = false;
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
  document.getElementById("userName").textContent = currentUser.name;
  document.getElementById("myWishlist").value = currentUser.wishlist || "";
  document.getElementById("assignedName").textContent = assignedUser.name;
  document.getElementById("assignedNameWishlist").textContent = assignedUser.name;
  document.getElementById("assignedNameChat").textContent = assignedUser.name;

  try {
  
    await Promise.all([
      setupRealtimeChats("assigned"),
      setupRealtimeChats("santa"),
      fetchAssignedWishlist()
    ]);

  } catch (err) {
    console.error("Error initializing dashboard:", err);
  }
}

function initDashboard() {
  showScreen("dashboard");
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
async function saveWishlist() {
  const wishlistTextarea = document.getElementById("myWishlist");
  const saveButton = wishlistTextarea.nextElementSibling;
  const wishlist = wishlistTextarea.value;
  
  wishlistTextarea.disabled = true;
  saveButton.disabled = true;
  const originalButtonText = saveButton.textContent;
  saveButton.textContent = "Saving...";
  saveButton.style.backgroundColor = "#474747";
 
  try {
    
    await participantsRef.doc(currentUser.email).update({wishlist: wishlist});
    saveButton.textContent = "Saved!";
    saveButton.style.backgroundColor = "var(--color-btn-primary)";
    setTimeout(() => {
      saveButton.textContent = originalButtonText;
      wishlistTextarea.disabled = false;
      saveButton.disabled = false;
    }, 1500);

  } catch (err) {
    console.error("Error saving wishlist:", err);
    saveButton.textContent = "Error!";
    saveButton.style.backgroundColor = "#B43B2B";
    setTimeout(() => {
      saveButton.textContent = originalButtonText;
      wishlistTextarea.disabled = false;
      saveButton.disabled = false;
      saveButton.style.backgroundColor = "var(--color-btn-primary)";
    }, 2000);
  }
}

function fetchAssignedWishlist() {
  const assignedArea = document.getElementById("assignedWishlist");

  participantsRef
    .doc(assignedUser.email)
    .onSnapshot(doc => {
      const newWishlist = res.assigned?.wishlist || "";
      if (lastAssignedWishlist !== newWishlist) {
        if (lastAssignedWishlist) {
          assignedArea.classList.add("highlight");
          setTimeout(() => assignedArea.classList.remove("highlight"), 3000);
        }
        assignedArea.textContent = newWishlist;
        lastAssignedWishlist = newWishlist;
      }
    });
}

// --- Fetch & Render Chats ---
function setupRealtimeChats(type) {
  let fromEmail, toEmail, chatDiv;

  if (type === "assigned") {
    fromEmail = currentUser.email;
    toEmail = assignedUser.email;
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    fromEmail = currentUser.email;
    toEmail = santaUser.email;
    chatDiv = document.getElementById("chatSanta");
  }

  const threadA = `${fromEmail}_to_${toEmail}`;
  const threadB = `${toEmail}_to_${fromEmail}`;

  chatsRef
    .where("threadID", "in", [threadA, threadB])
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      chatDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const m = doc.data();
        const msgDiv = document.createElement("div");
        const isMe = m.from === currentUser.email;
        msgDiv.classList.add("message", isMe ? "sent" : "received");
        msgDiv.textContent = m.message;
        chatDiv.appendChild(msgDiv);
      });
      chatDiv.scrollTop = chatDiv.scrollHeight;
    });
}

// --- Send Chat ---
function sendChat(type) {
  let toEmail, msgInput, chatDiv;
  if (type === "assigned") {
    toEmail = assignedUser.email;
    msgInput = document.getElementById("chatAssignedInput");
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    toEmail = santaUser.email; // your Secret Santa
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

  const threadID = `${currentUser.email}_to_${toEmail}`;

  // Send to backend
  chatsRef.add({
    from: currentUser.email,
    to: toEmail,
    message: messageText,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    threadID
  });
}
