const path = require("path");
const AuroraBetaStyler = require(path.join(__dirname, "..", "core", "plugins","aurora-beta-styler"));

module.exports = {
  config: {
    name: "thread",
    description: "Manage threads",
    usage: "/thread <ban/approve/pending/list/unban> [threadID]",
    role: 3,
  },

  run: async ({ api, event, args, db, admins }) => {
    const { threadID, messageID, senderID } = event;
    const action = args[0]?.toLowerCase();
    const targetThreadID = args[1]?.trim();

    if (!admins.includes(senderID.toString())) return api.sendMessage("❌ Access denied.", threadID, messageID);
    if (!db) return api.sendMessage("❌ Database not ready.", threadID, messageID);

    const bannedThreadsCollection = db.db("bannedThreads");

    if (action === "ban" && targetThreadID) {
      if (!/^\d+$/.test(targetThreadID)) return api.sendMessage("❌ Invalid threadID.", threadID, messageID);
      const exists = await bannedThreadsCollection.findOne({ threadID: targetThreadID });
      if (exists) return api.sendMessage("⚠️ Already banned.", threadID, messageID);
      await bannedThreadsCollection.insertOne({ threadID: targetThreadID, bannedAt: new Date() });
      return api.sendMessage(`🔒 Banned ${targetThreadID}`, threadID, messageID);
    }

    if (action === "approve" || action === "unban") {
      if (!/^\d+$/.test(targetThreadID)) return api.sendMessage("❌ Invalid threadID.", threadID, messageID);
      await bannedThreadsCollection.deleteOne({ threadID: targetThreadID });
      return api.sendMessage(`✅ Unbanned ${targetThreadID}`, threadID, messageID);
    }

    if (action === "list") {
      const banned = await bannedThreadsCollection.find().toArray();
      const msg = banned.length ? banned.map(t => `• ${t.threadID}`).join("\n") : "No banned threads.";
      return api.sendMessage(msg, threadID, messageID);
    }

    return api.sendMessage("Usage: /thread ban/unban/list", threadID, messageID);
  },

  preventBannedResponse: function(api, event, next) {
    if (!global.db) return next();
    const bannedThreadsCollection = global.db.db("bannedThreads");
    bannedThreadsCollection.findOne({ threadID: event.threadID.toString() }, (err, result) => {
      if (err) return next();
      if (result) return;
      next();
    });
  }
};
