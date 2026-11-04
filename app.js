import { initializeApp }
from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getDatabase,
  ref,
  push,
  set,
  update,
  onValue,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";


// FIREBASE CONFIG

const firebaseConfig = {
  apiKey: "AIzaSyCapZG8koc_MV3iP5mcpyYVpSrNeYWDmpg",
  authDomain: "rsm-website-chat.firebaseapp.com",
  databaseURL: "https://rsm-website-chat-default-rtdb.firebaseio.com",
  projectId: "rsm-website-chat",
  storageBucket: "rsm-website-chat.firebasestorage.app",
  messagingSenderId: "207089077408",
  appId: "1:207089077408:web:c4d14cfd7bfdcb32968dc5",
  measurementId: "G-26KDPFFPGT"
};


// TWO USERS

const USERS = {
  "mastram8177@gmail.com": {
    name: "V .",
    initial: "V"
  },
  "zalar8177@gmail.com": {
    name: "R .",
    initial: "R"
  }
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = id => document.getElementById(id);

let currentUser = null;
let messagesData = {};
let seenData = {};
let presenceData = {};
let listeners = [];
let replyData = null;
let editingId = null;
let typingTimer = null;
let typingValue = null;
let firstLoad = true;
let menuOpenId = null;


// HELPERS

function status(value) {
  $("appStatus").textContent = value;
}

function show(id, value) {
  $(id).hidden = !value;
}

function userName(email) {
  return USERS[(email || "").toLowerCase()]?.name || "User";
}

function timeFormat(time) {
  if (!time) return "Sending...";
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function errorText(error) {
  const errors = {
    "auth/invalid-credential": "Email અથવા Password ખોટો છે.",
    "auth/user-not-found": "Account મળ્યું નથી.",
    "auth/wrong-password": "Password ખોટો છે.",
    "auth/invalid-email": "Email યોગ્ય નથી.",
    "auth/too-many-requests": "થોડી વાર પછી ફરી પ્રયાસ કરો.",
    "auth/network-request-failed": "Internet તપાસો.",
    "auth/unauthorized-domain": "Firebase Authorized Domains તપાસો.",
    "auth/operation-not-allowed": "Email/Password Login Enable કરો."
  };

  return errors[error.code] || error.message || error.code;
}


// LOGIN

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email").value.trim().toLowerCase();
  const password = $("password").value;

  $("loginError").textContent = "";

  if (!USERS[email]) {
    $("loginError").textContent = "આ Email ને મંજૂરી નથી.";
    return;
  }

  $("loginBtn").disabled = true;
  $("loginBtn").textContent = "PLEASE WAIT...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    status("Login Successful");
  } catch (error) {
    console.error("LOGIN ERROR", error);
    $("loginError").textContent = errorText(error);
  } finally {
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "LOGIN";
  }
});


// AUTH

onAuthStateChanged(auth, async user => {
  cleanup();
  firstLoad = true;
  currentUser = null;

  if (!user) {
    show("loginScreen", true);
    show("chatScreen", false);
    status("Ready to Login");
    return;
  }

  const email = (user.email || "").toLowerCase();

  if (!USERS[email]) {
    await signOut(auth);
    $("loginError").textContent = "Unauthorized Account";
    return;
  }

  currentUser = user;

  show("loginScreen", false);
  show("chatScreen", true);

  const otherEmail = Object.keys(USERS).find(e => e !== email);

  $("otherName").textContent = USERS[otherEmail].name;
  $("otherAvatar").textContent = USERS[otherEmail].initial;

  startConnection();
  startPresence();
  startTyping();
  startMessages();
});


// CLEANUP

function cleanup() {
  listeners.forEach(unsubscribe => {
    try { unsubscribe(); } catch {}
  });

  listeners = [];
  clearTimeout(typingTimer);
  typingValue = null;
}

function listen(path, callback, errorCallback) {
  const unsub = onValue(ref(db, path), callback, errorCallback);
  listeners.push(unsub);
  return unsub;
}


// CONNECTION

function startConnection() {
  const unsub = onValue(
    ref(db, ".info/connected"),
    snapshot => {
      $("connectionStatus").textContent =
        snapshot.val() === true ? "● Connected" : "● Connecting...";
    }
  );

  listeners.push(unsub);
}


// PRESENCE

function startPresence() {
  const myRef = ref(db, "presence/" + currentUser.uid);

  const connectedListener = onValue(
    ref(db, ".info/connected"),
    async snapshot => {
      if (snapshot.val() !== true || !currentUser) return;

      try {
        await onDisconnect(myRef).set({
          online: false,
          lastSeen: serverTimestamp(),
          email: currentUser.email
        });

        await set(myRef, {
          online: true,
          lastSeen: serverTimestamp(),
          email: currentUser.email
        });
      } catch (error) {
        console.error("PRESENCE ERROR", error);
      }
    }
  );

  listeners.push(connectedListener);

  const presenceListener = onValue(
    ref(db, "presence"),
    snapshot => {
      presenceData = snapshot.val() || {};

      const otherEmail = Object.keys(USERS).find(
        e => e !== currentUser.email.toLowerCase()
      );

      const other = Object.values(presenceData).find(
        p => p.email === otherEmail
      );

      $("onlineStatus").textContent =
        other?.online ? "● Online" : "● Offline";
    }
  );

  listeners.push(presenceListener);
}


// TYPING

function startTyping() {
  const unsub = onValue(ref(db, "typing"), snapshot => {
    const data = snapshot.val() || {};

    const otherTyping = Object.entries(data).some(
      ([uid, value]) => uid !== currentUser.uid && value === true
    );

    $("typingStatus").textContent =
      otherTyping ? "Typing..." : "";
  });

  listeners.push(unsub);
}

async function setTyping(value) {
  if (!currentUser || typingValue === value) return;

  typingValue = value;

  try {
    await set(ref(db, "typing/" + currentUser.uid), value);
  } catch (error) {
    console.error("TYPING ERROR", error);
  }
}

$("messageInput").addEventListener("input", () => {
  setTyping(true);
  clearTimeout(typingTimer);

  typingTimer = setTimeout(() => setTyping(false), 1200);
});


// MESSAGES

function startMessages() {
  const messageQuery = query(
    ref(db, "messages"),
    orderByChild("createdAt"),
    limitToLast(200)
  );

  const messageListener = onValue(
    messageQuery,
    snapshot => {
      const previousCount = Object.keys(messagesData).length;
      messagesData = snapshot.val() || {};

      renderMessages();
      markSeen();

      if (!firstLoad && Object.keys(messagesData).length > previousCount) {
        notifyNewMessage();
      }

      firstLoad = false;
    },
    error => {
      console.error("MESSAGE ERROR", error);
      alert("Message Database Error: " + error.message);
    }
  );

  listeners.push(messageListener);

  const seenListener = onValue(
    ref(db, "messageSeen"),
    snapshot => {
      seenData = snapshot.val() || {};
      renderMessages();
    }
  );

  listeners.push(seenListener);
}


// SEEN

async function markSeen() {
  for (const [id, message] of Object.entries(messagesData)) {
    if (message.senderUid === currentUser.uid) continue;
    if (message.unsent) continue;
    if (message.deletedFor?.[currentUser.uid]) continue;
    if (seenData[id]?.[currentUser.uid]) continue;

    try {
      await set(
        ref(db, "messageSeen/" + id + "/" + currentUser.uid),
        true
      );
    } catch (error) {
      console.error("SEEN ERROR", error);
    }
  }
}


// MENU HELPER

function addMenuItem(menu, label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className || "";

  button.addEventListener("click", async event => {
    event.stopPropagation();
    menu.hidden = true;

    try {
      await callback();
    } catch (error) {
      console.error(error);
      alert("Action Error: " + error.message);
    }
  });

  menu.appendChild(button);
}


// RENDER MESSAGES

function renderMessages() {
  if (!currentUser) return;

  const box = $("messages");
  const nearBottom =
    box.scrollHeight - box.scrollTop - box.clientHeight < 120;

  box.replaceChildren();

  const entries = Object.entries(messagesData).sort(
    (a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0)
  );

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "welcome";
    empty.innerHTML = "<div class='welcome-icon'>💬</div><h3>Welcome to RSM CHAT</h3><p>Your private conversation starts here.</p>";
    box.appendChild(empty);
    return;
  }

  for (const [id, message] of entries) {
    if (message.deletedFor?.[currentUser.uid]) continue;

    const mine = message.senderUid === currentUser.uid;
    const bubble = document.createElement("div");

    bubble.className = "message " + (mine ? "mine" : "other");

    // Sender
    const sender = document.createElement("div");
    sender.className = "sender-name";
    sender.textContent = mine ? "You" : userName(message.senderEmail);
    bubble.appendChild(sender);

    // Reply
    if (message.replyTo) {
      const quote = document.createElement("div");
      quote.className = "reply-quote";
      quote.textContent = "↪ " + message.replyTo;
      bubble.appendChild(quote);
    }

    // Message text
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.unsent
      ? "This message was unsent"
      : message.text || "";
    bubble.appendChild(text);

    if (message.edited && !message.unsent) {
      const edited = document.createElement("div");
      edited.className = "edited-label";
      edited.textContent = "Edited";
      bubble.appendChild(edited);
    }

    // Time and Seen
    const time = document.createElement("span");
    time.className = "message-time";

    const otherSeen = Object.entries(seenData[id] || {}).some(
      ([uid, value]) => uid !== currentUser.uid && value === true
    );

    time.textContent =
      timeFormat(message.createdAt) +
      (mine ? (otherSeen ? " · Seen ✓✓" : " · Sent ✓") : "");

    bubble.appendChild(time);

    if (!message.unsent) {
      // Reactions
      const reactions = message.reactions || {};
      const groups = {};

      Object.values(reactions).forEach(emoji => {
        groups[emoji] = (groups[emoji] || 0) + 1;
      });

      const reactionRow = document.createElement("div");
      reactionRow.className = "reaction-row";

      Object.entries(groups).forEach(([emoji, count]) => {
        const chip = document.createElement("span");
        chip.className = "reaction-chip";
        chip.textContent = emoji + " " + count;
        reactionRow.appendChild(chip);
      });

      bubble.appendChild(reactionRow);

      // Quick reactions
      const picker = document.createElement("div");
      picker.className = "reaction-picker";

      ["❤️", "😂", "🔥", "👍", "😍"].forEach(emoji => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = emoji;
        button.addEventListener("click", () => toggleReaction(id, emoji));
        picker.appendChild(button);
      });

      bubble.appendChild(picker);

      // Instagram action menu
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const more = document.createElement("button");
      more.type = "button";
      more.className = "more-btn";
      more.textContent = "⋯";

      const menu = document.createElement("div");
      menu.className = "action-menu";
      menu.hidden = true;

      addMenuItem(menu, "↩ Reply", "reply-option", async () => {
        editingId = null;
        replyData = message.text;
        $("replyText").textContent = message.text;
        show("editPreview", false);
        show("replyPreview", true);
        $("messageInput").focus();
      });

      if (mine) {
        addMenuItem(menu, "✏️ Edit", "edit-option", async () => {
          startEdit(id);
        });
      }

      addMenuItem(menu, "📋 Copy", "", async () => {
        await copyMessage(message.text);
      });

      addMenuItem(menu, "🗑 Delete for me", "danger", async () => {
        await deleteForMe(id);
      });

      if (mine) {
        addMenuItem(menu, "↩ Unsend for everyone", "danger", async () => {
          await unsendMessage(id);
        });
      }

      more.addEventListener("click", event => {
        event.stopPropagation();

        document.querySelectorAll(".action-menu").forEach(other => {
          if (other !== menu) other.hidden = true;
        });

        menu.hidden = !menu.hidden;
      });

      actions.appendChild(more);
      actions.appendChild(menu);
      bubble.appendChild(actions);

      // Long press
      let pressTimer;
      let longPressed = false;

      bubble.addEventListener("contextmenu", event => {
        event.preventDefault();
        menu.hidden = false;
      });

      bubble.addEventListener("touchstart", () => {
        longPressed = false;

        pressTimer = setTimeout(() => {
          longPressed = true;
          menu.hidden = false;
          if (navigator.vibrate) navigator.vibrate(25);
        }, 550);
      }, { passive: true });

      ["touchend", "touchmove", "touchcancel"].forEach(name => {
        bubble.addEventListener(name, () => clearTimeout(pressTimer), {
          passive: true
        });
      });
    }

    box.appendChild(bubble);
  }

  if (nearBottom) box.scrollTop = box.scrollHeight;
}


// CLOSE MENUS

document.addEventListener("click", () => {
  document.querySelectorAll(".action-menu").forEach(menu => {
    menu.hidden = true;
  });
});


// REPLY

$("cancelReply").addEventListener("click", () => {
  replyData = null;
  show("replyPreview", false);
});


// EDIT

function startEdit(id) {
  const message = messagesData[id];

  if (!message || message.senderUid !== currentUser.uid) return;

  editingId = id;
  replyData = null;

  show("replyPreview", false);
  show("editPreview", true);

  $("messageInput").value = message.text;
  $("messageInput").focus();
}

function cancelEdit() {
  editingId = null;
  $("messageInput").value = "";
  show("editPreview", false);
}

$("cancelEdit").addEventListener("click", cancelEdit);

async function editMessage(id, newText) {
  const message = messagesData[id];

  if (!message || message.senderUid !== currentUser.uid || message.unsent) {
    throw new Error("You cannot edit this message.");
  }

  await update(ref(db, "messages/" + id), {
    text: newText,
    edited: true
  });
}


// COPY

async function copyMessage(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Message Copied!");
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    alert("Message Copied!");
  }
}


// DELETE FOR ME

async function deleteForMe(id) {
  if (!confirm("Delete this message for you?")) return;

  await set(
    ref(db, "messages/" + id + "/deletedFor/" + currentUser.uid),
    true
  );
}


// UNSEND

async function unsendMessage(id) {
  const message = messagesData[id];

  if (!message || message.senderUid !== currentUser.uid) {
    throw new Error("Only your own message can be unsent.");
  }

  if (!confirm("Unsend this message for everyone?")) return;

  await update(ref(db, "messages/" + id), {
    text: "",
    unsent: true
  });
}


// REACTIONS

async function toggleReaction(id, emoji) {
  const allowed = ["❤️", "😂", "🔥", "👍", "😍"];

  if (!allowed.includes(emoji)) return;

  const old = messagesData[id]?.reactions?.[currentUser.uid];

  await set(
    ref(db, "messages/" + id + "/reactions/" + currentUser.uid),
    old === emoji ? null : emoji
  );
}


// SEND MESSAGE OR SAVE EDIT

$("messageForm").addEventListener("submit", async event => {
  event.preventDefault();

  const input = $("messageInput");
  const text = input.value.trim();

  if (!text || !currentUser || text.length > 2000) return;

  $("sendBtn").disabled = true;

  try {
    if (editingId) {
      await editMessage(editingId, text);
      editingId = null;
      show("editPreview", false);
    } else {
      const newMessage = push(ref(db, "messages"));

      await set(newMessage, {
        senderUid: currentUser.uid,
        senderEmail: currentUser.email,
        senderName: userName(currentUser.email),
        text,
        createdAt: serverTimestamp(),
        unsent: false,
        replyTo: replyData || null
      });

      replyData = null;
      show("replyPreview", false);
    }

    input.value = "";
    show("emojiPanel", false);
    await setTyping(false);
    input.focus();

  } catch (error) {
    console.error("SEND/EDIT ERROR", error);
    alert("Message Error: " + error.message);
  } finally {
    $("sendBtn").disabled = false;
  }
});


// EMOJI PANEL

$("emojiBtn").addEventListener("click", () => {
  show("emojiPanel", $("emojiPanel").hidden);
});

document.querySelectorAll("#emojiPanel button").forEach(button => {
  button.addEventListener("click", () => {
    $("messageInput").value += button.textContent;
    $("messageInput").focus();
  });
});


// NOTIFICATION

function notifyNewMessage() {
  if (
    document.visibilityState === "visible" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) return;

  const latest = Object.values(messagesData).sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  )[0];

  if (
    latest &&
    latest.senderUid !== currentUser.uid &&
    !latest.unsent
  ) {
    new Notification("RSM CHAT • " + userName(latest.senderEmail), {
      body: latest.text || "New Message"
    });
  }
}


// LOGOUT

$("logoutBtn").addEventListener("click", async () => {
  if (!confirm("Logout કરવું છે?")) return;

  try {
    await set(ref(db, "typing/" + currentUser.uid), false);

    await set(ref(db, "presence/" + currentUser.uid), {
      online: false,
      lastSeen: serverTimestamp(),
      email: currentUser.email
    });

    await onDisconnect(
      ref(db, "presence/" + currentUser.uid)
    ).cancel();

    await signOut(auth);
  } catch (error) {
    alert("Logout Error: " + error.message);
  }
});


// NOTIFICATION PERMISSION

const notificationButton = document.createElement("button");

notificationButton.type = "button";
notificationButton.className = "notification-button";
notificationButton.textContent = "🔔 Enable Notifications";

notificationButton.style.cssText =
  "margin:8px auto;padding:8px 14px;background:#222;color:white;border:1px solid #444;border-radius:12px;";

$("chatScreen").appendChild(notificationButton);

notificationButton.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    alert("Notifications are not supported.");
    return;
  }

  const result = await Notification.requestPermission();

  alert(
    result === "granted"
      ? "Notifications Enabled"
      : "Permission Not Granted"
  );
});

status("RSM CHAT V3 Ready");
console.log("RSM CHAT V3 Loaded");