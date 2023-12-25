import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
} from "@whiskeysockets/baileys";
import handler from "./handler.js";
import pino from "pino"

const phoneNumber = "62889800740914"
const pairingCode = !!phoneNumber || process.argv.includes("--code")
const logger = pino({ level: "silent", stream: "store" }).child({ level: "silent" })
const store = makeInMemoryStore(logger);
const { state, saveCreds } = await useMultiFileAuthState("./login");
//const { version } = await fetchLatestBaileysVersion();

export const sock = makeWASocket({
  browser: ["Chrome (Linux)", "", ""],
  printQRInTerminal: !pairingCode,
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })), 
  },
});

async function chitandaBotInit() {
  store.bind(sock.ev)
  
  if(pairingCode && !sock.authState.creds.registered) {
  setTimeout(async () => {
    let code = await sock.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join("-") || code;
    console.log("Your Pairing Code :" + code)
  }, 3000); 
  
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      var _a, _b;
      var shouldReconnect =
        ((_b =
          (_a = lastDisconnect.error) === null || _a === void 0
            ? void 0
            : _a.output) === null || _b === void 0
          ? void 0
          : _b.statusCode) !== DisconnectReason.loggedOut;
      console.log(
        "connection closed due to ",
        lastDisconnect.error,
        ", reconnecting ",
        shouldReconnect
      );
      if (shouldReconnect) {
        chitandaBotInit();
      }
    } else if (connection === "open") {
      console.log("opened connection");
    }
  });

  sock.ev.on("creds.update", async() => await saveCreds());

  sock.ev.on("messages.upsert", async (m) => {
    m.messages.forEach(async (message) => {
      if (
        !message.message ||
        message.key.fromMe ||
        (message.key && message.key.remoteJid == "status@broadcast")
      )
        return;
      if (message.message.ephemeralMessage) {
        message.message = message.message.ephemeralMessage.message;
      }

      try {
        await sock.sendPresenceUpdate("composing", message.key.remoteJid);
        await handler(sock, message);
      } catch (e) {
        console.log("[ERROR] " + e.message);
      } finally {
        await sock.sendPresenceUpdate("available", message.key.remoteJid);
      }
    });
  });
}

chitandaBotInit();
