const fs = require("fs");
const path = require("path");

const OWNER_ID = "61588090931561";
const DELAY_SECONDS = 5;

const MAX_MESSAGES_PER_WINDOW = 5;
const LOOP_WINDOW_MS = 3000;

const stateFile = path.join(__dirname, "spam_state.json");
let persisted = {};
try {
  if (fs.existsSync(stateFile)) {
    persisted = JSON.parse(fs.readFileSync(stateFile, "utf8")) || {};
  }
} catch {}
persisted.lists = persisted.lists || {};
persisted.active = persisted.active || {};

if (!global.spamIndexes) global.spamIndexes = {};
if (!global.lastReplyTime) global.lastReplyTime = {};
if (!global.loopGuard) global.loopGuard = {};

function saveState() {
  try { fs.writeFileSync(stateFile, JSON.stringify(persisted, null, 2), "utf8"); } catch {}
}

async function sendMessageCompat(api, text, threadID) {
  try { if (typeof api.sendMessageMqtt === "function") return await api.sendMessageMqtt(text, threadID); } catch {}
  try { if (typeof api.sendMessage === "function") return await api.sendMessage(text, threadID); } catch {}
}

function looksLikeThreadID(token) { return /^\d{6,}$/.test(token); }
function startSpam(threadID) { persisted.active[threadID] = true; if (typeof global.spamIndexes[threadID] !== "number") global.spamIndexes[threadID] = 0; saveState(); }
function stopSpam(threadID) { delete persisted.active[threadID]; saveState(); }

module.exports = {
  config: {
    name: "spam",
    description: "Auto reply when someone chats",
    author: "You + ChatGPT",
    role: 0,
    nonPrefix: true,
  },

  handleEvent: async ({ api, event }) => {
    const { threadID, body, senderID } = event;
    if (!body) return;

    const raw = body.trim();
    const lower = raw.toLowerCase();
    const isOwner = senderID == OWNER_ID;

    const cmdSet = "andar ";
    const startTrigger = "start";
    const stopTrigger = "✓";

    // SET MESSAGE LIST
    if (lower.startsWith(cmdSet) && isOwner) {
      const after = raw.substring(cmdSet.length).trim();
      if (!after) return;
      const tokens = after.split(" ");
      let targetThread = threadID;
      let rest = after;
      if (tokens.length > 1 && looksLikeThreadID(tokens[0])) { targetThread = tokens[0]; rest = after.substring(tokens[0].length).trim(); }
      const list = rest.split(",").map(s => s.trim()).filter(Boolean);
      if (!list.length) return;
      persisted.lists[targetThread] = list;
      global.spamIndexes[targetThread] = 0;
      saveState();
      return;
    }

    // START SPAM
    if (lower.startsWith(startTrigger) && isOwner) {
      const parts = raw.split(/\s+/);
      let targetThread = threadID;
      if (parts.length >= 2 && looksLikeThreadID(parts[1])) targetThread = parts[1];
      startSpam(targetThread);
      return;
    }

    // STOP SPAM
    if (lower.startsWith(stopTrigger) && isOwner) {
      const parts = raw.split(/\s+/);
      let targetThread = threadID;
      if (parts[1] && looksLikeThreadID(parts[1])) targetThread = parts[1];
      stopSpam(targetThread);
      return;
    }

    // CHECK BANNED THREAD
    if (global.db) {
      try {
        const banned = await global.db.db("bannedThreads").findOne({ threadID: threadID.toString() });
        if (banned) return;
      } catch {}
    }

    // AUTO REPLY
    if (!persisted.active[threadID]) return;
    const botID = typeof api.getCurrentUserID === "function" ? api.getCurrentUserID() : api.getCurrentUserID;
    if (senderID == botID) return;

    const now = Date.now();

    // ANTI-LOOP
    if (!global.loopGuard[threadID]) global.loopGuard[threadID] = [];
    global.loopGuard[threadID].push(now);
    global.loopGuard[threadID] = global.loopGuard[threadID].filter(t => now - t < LOOP_WINDOW_MS);
    if (global.loopGuard[threadID].length > MAX_MESSAGES_PER_WINDOW) return;

    // COOLDOWN
    if (global.lastReplyTime[threadID] && now - global.lastReplyTime[threadID] < DELAY_SECONDS * 1000) return;
    global.lastReplyTime[threadID] = now;

    const spamMessages = persisted.lists[threadID] || ["😴💤💤💤💤💤💤", "gosolo = doggies"];
    if (!spamMessages.length) return;

    if (typeof global.spamIndexes[threadID] !== "number") global.spamIndexes[threadID] = 0;

    const idx = global.spamIndexes[threadID] % spamMessages.length;
    const msg = spamMessages[idx];
    await sendMessageCompat(api, msg, threadID);
    global.spamIndexes[threadID] = (global.spamIndexes[threadID] + 1) % spamMessages.length;
  }
};
