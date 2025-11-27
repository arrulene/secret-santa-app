let currentUser, assignedUser;
let lastAssignedWishlist = "";

// Firestore collection references
const participantsRef = db.collection("participants");
const chatsRef = db.collection("chats");

// Enable offline data persistence
db.enablePersistence().catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn("Multiple tabs open: persistence can only be enabled in one tab at a time.");
  } else if (err.code === 'unimplemented') {
    console.warn("Persistence is not available in this browser.");
  }
});

// --- Startup ---
document.addEventListener("DOMContentLoaded", () => showScreen("loginBox"));

// --- Helper ---
function showScreen(screenId) {
  const screens = ["loginBox", "revealScreen", "dashboard"];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === screenId) {
      if (id === "dashboard") {
        el.style.display = "block"; 
        setTimeout(() => el.classList.add("show"), 20);
      } else {
        el.style.display = (id === "revealScreen") ? "flex" : "block";
        el.classList.remove("show");
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
  if (!email || !code) return alert("Enter both email and login code");

  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loaderText");
  document.body.style.overflow = "hidden";
  loader.style.display = "block";
  loaderText.textContent = "Logging you in...";

  try {
    const snapshot = await participantsRef
      .where("email", "==", email)
      .where("loginCode", "==", code)
      .get();

    if (snapshot.empty) throw new Error("Invalid email or code");

    currentUser = snapshot.docs[0].data();

    // Fetch assigned participant by alias
    const assignedSnap = await participantsRef
      .where("alias", "==", currentUser.assignedToAlias)
      .get();
    assignedUser = assignedSnap.docs[0]?.data() || {};

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

// --- Dashboard ---
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
      continueBtn.disabled = true;
      document.querySelectorAll(".confetti-piece").forEach(el => el.remove());

      try {
        await participantsRef.doc(currentUser.email).update({ firstLogin: false });
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
      fetchAssignedWishlist()
    ]);
  } catch (err) {
    console.error("Error initializing dashboard:", err);
  }
}

function initDashboard() { showScreen("dashboard"); }

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
    await participantsRef.doc(currentUser.email).update({ wishlist });
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

// --- Fetch Assigned Wishlist ---
function fetchAssignedWishlist() {
  const assignedArea = document.getElementById("assignedWishlist");
  participantsRef
    .where("alias", "==", currentUser.assignedToAlias)
    .onSnapshot(snapshot => {
      const doc = snapshot.docs[0];
      const newWishlist = doc?.data()?.wishlist || "";
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

// --- Chats ---
function setupRealtimeChats(type) {
  let fromAlias, toAlias, chatDiv;

  if (type === "assigned") {
    fromAlias = currentUser.alias;
    toAlias = currentUser.assignedToAlias;
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    fromAlias = currentUser.alias;
    toAlias = currentUser.santaAlias;
    chatDiv = document.getElementById("chatSanta");
  }

  const threadA = `${fromAlias}_to_${toAlias}`;
  const threadB = `${toAlias}_to_${fromAlias}`;

  chatsRef
    .where("threadID", "in", [threadA, threadB])
    .orderBy("timestamp")
    .onSnapshot(snapshot => {
      chatDiv.innerHTML = "";
      snapshot.forEach(doc => {
        const m = doc.data();
        const isMe = m.from === currentUser.alias;
        const msgDiv = document.createElement("div");
        msgDiv.classList.add("message", isMe ? "sent" : "received");
        msgDiv.textContent = m.message;
        chatDiv.appendChild(msgDiv);
      });
      chatDiv.scrollTop = chatDiv.scrollHeight;
    });
}

function sendChat(type) {
  let toAlias, msgInput, chatDiv;
  if (type === "assigned") {
    toAlias = currentUser.assignedToAlias;
    msgInput = document.getElementById("chatAssignedInput");
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    toAlias = currentUser.santaAlias;
    msgInput = document.getElementById("chatSantaInput");
    chatDiv = document.getElementById("chatSanta");
  }

  const messageText = msgInput.value.trim();
  if (!messageText) return;
  msgInput.value = "";

  const threadID = `${currentUser.alias}_to_${toAlias}`;

  chatsRef.add({
    from: currentUser.alias,
    to: toAlias,
    message: messageText,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    threadID
  });
}
