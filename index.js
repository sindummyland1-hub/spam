const fs = require("fs");
const login = require("fca-unofficial");

const commands = new Map();
const prefix = "/";

// ================= LOAD COMMANDS =================
const files = fs.readdirSync("./modules/commands");
for (const file of files) {
  if (!file.endsWith(".js")) continue;
  const cmd = require(`./modules/commands/${file}`);
  if (cmd.config?.name) {
    commands.set(cmd.config.name, cmd);
    console.log("Loaded:", cmd.config.name);
  }
}

// ================= LOGIN =================
login(
  {
    appState: JSON.parse(fs.readFileSync("appstate.json", "utf8"))
  },
  (err, api) => {
    if (err) return console.error("Login error:", err);

    console.log("✅ Bot logged in!");

    global.db = null; // optional, prevents thread.js crashes

    api.setOptions({ listenEvents: true, selfListen: false });

    api.listenMqtt(async (err, event) => {
      if (err) return console.error(err);

      // ===== HANDLE EVENTS (spam.js etc) =====
      for (const cmd of commands.values()) {
        if (typeof cmd.handleEvent === "function") {
          try {
            await cmd.handleEvent({ api, event });
          } catch (e) {
            console.error("handleEvent error:", e);
          }
        }
      }

      // ===== COMMANDS (/thread etc) =====
      if (event.body && event.body.startsWith(prefix)) {
        const args = event.body.slice(prefix.length).trim().split(/\s+/);
        const cmdName = args.shift().toLowerCase();
        const cmd = commands.get(cmdName);
        if (!cmd) return;

        try {
          await cmd.run({
            api,
            event,
            args,
            admins: ["61588090931561"], // your ID
            db: null // optional MongoDB
          });
        } catch (e) {
          console.error("Command error:", e);
        }
      }
    });
  }
);
