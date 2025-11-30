let currentUser, assignedUser
let lastAssignedWishlist = "";

import {initializeApp} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
  getFirestore, collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
  onSnapshot, enableIndexedDbPersistence, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA8BfH4ImIczMo_eGhN4S1rQY5Vi_HzV2I",
  authDomain: "secret-santa-9ea6b.firebaseapp.com",
  projectId: "secret-santa-9ea6b",
  storageBucket: "secret-santa-9ea6b.firebasestorage.app",
  messagingSenderId: "927536484288",
  appId: "1:927536484288:web:4a6d5425a58d391771c225"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();

// Firestore references
const chatsRef = collection(db, "chats");

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn("Multiple tabs open: persistence only works in one tab at a time.");
  } else if (err.code === 'unimplemented') {
    console.warn("Persistence not supported in this browser.");
  }
});

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

  const loginButton = document.getElementById("loginBtn")

  loginButton.disabled = true;
  loginButton.style.opacity = 0.6;

  if (!email || !code) { 
    alert("Enter both email and login code"); 
    loginButton.disabled = false;
    loginButton.style.opacity = 1;
    return; 
  }

  const loader = document.getElementById("loader");
  const loaderText = document.getElementById("loaderText");
  document.body.style.overflow = "hidden";
  loader.style.display = "block";
  loaderText.textContent = "Logging you in...";

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, code);
    const user = userCredential.user;

    const myUID = user.uid;

    // fetch user document
    const myDocRef = doc(db, "participants", myUID);
    const mySnap = await getDoc(myDocRef);

    if (!mySnap.exists()) throw new Error("User profile not found.");

    currentUser = mySnap.data();

    // fetch assigned user document
    const assignedUID = currentUser.assignedToAlias;

    const assignedDocRef = doc(db, "participants", assignedUID);
    const assignedSnap = await getDoc(assignedDocRef);

    if (!assignedSnap.exists()) throw new Error("Assigned person not found");

    assignedUser = assignedSnap.data();

    // continue sign in
    loaderText.textContent = "Loading your dashboard...";
    await loadDashboard();

  } catch (err) {
    alert("Error connecting to server: " + err.message);
    console.error(err);
  } finally {
    document.body.style.overflow = "auto";
    loader.style.display = "none";
    loginButton.disabled = false;
    loginButton.style.opacity = 1;
  }
}

window.handleLogin = handleLogin;

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
      continueBtn.disabled = true;
      document.querySelectorAll(".confetti-piece").forEach(el => el.remove());

      try {
        await updateDoc(doc(db, "participants", currentUser.alias), {
          firstLogin: false
        });
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

// --- Confetti ---
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
    await updateDoc(doc(db,"participants",currentUser.alias), {wishlist});
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

window.saveWishlist = saveWishlist;

function fetchAssignedWishlist() {
  const assignedArea = document.getElementById("assignedWishlist");

  const assignedRef = doc(db, "participants", currentUser.assignedToAlias);

  onSnapshot(assignedRef, (docSnap) => {
    const newWishlist = docSnap.data()?.wishlist || "";
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

// --- Realtime Chats ---
function setupRealtimeChats(type) {
  let fromAlias, toAlias, chatDiv;

  if (type === "assigned") {
    fromAlias = currentUser.alias;
    toAlias = assignedUser.alias;
    chatDiv = document.getElementById("chatAssigned");
  } else if (type === "santa") {
    fromAlias = currentUser.alias;
    toAlias = currentUser.santaAlias;
    chatDiv = document.getElementById("chatSanta");
  }

  const threadA = `${fromAlias}_to_${toAlias}`;
  const threadB = `${toAlias}_to_${fromAlias}`;

  const q = query(
    chatsRef,
    where("threadID", "in", [threadA, threadB]),
    orderBy("timestamp")
  );

  onSnapshot(q, (snapshot) => {
    chatDiv.innerHTML = ""; // clear once per snapshot
    snapshot.forEach(docSnap => {
      const m = docSnap.data();
      const isMe = m.from === currentUser.alias;
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("message", isMe ? "sent" : "received");
      msgDiv.textContent = m.message;
      chatDiv.appendChild(msgDiv);
    });
    chatDiv.scrollTop = chatDiv.scrollHeight;
  });
}

// --- Send Chat ---
async function sendChat(type) {
  let toAlias, msgInput, chatDiv;

  if (type === "assigned") {
    toAlias = assignedUser.alias;
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

  await addDoc(chatsRef, {
    from: currentUser.alias,
    to: toAlias,
    message: messageText,
    timestamp: serverTimestamp(),
    threadID
  });
}

window.sendChat = sendChat;