/**
 * Bot de WhatsApp basico.
 * Responde con un menu de opciones: horarios, precios, ubicacion y contacto.
 * Cuando alguien escribe cualquier cosa, el bot muestra el menu.
 * Si escribe un numero (1, 2, 3 o 4), responde con la info de esa opcion.
 *
 * Toda la info del negocio se configura con variables de entorno,
 * asi no hay que tocar el codigo para cambiar los textos.
 */

const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");

// ---- Textos configurables (variables de entorno en Railway) ----
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Mi Negocio";
const HOURS_TEXT =
  process.env.HOURS_TEXT || "Lunes a viernes de 9 a 18hs. Sabados de 9 a 13hs.";
const PRICES_TEXT =
  process.env.PRICES_TEXT || "Escribinos y te pasamos la lista de precios actualizada.";
const LOCATION_TEXT =
  process.env.LOCATION_TEXT || "Estamos en [tu direccion aca]. Ver en Google Maps: [link]";
const CONTACT_TEXT =
  process.env.CONTACT_TEXT ||
  "Si preferis hablar con una persona, esperá y en breve te contestamos por acá.";

const AUTH_FOLDER = "auth_info";

function buildMenu() {
  return (
    `Hola! Somos *${BUSINESS_NAME}* 👋\n\n` +
    `Elegi una opcion escribiendo el numero:\n\n` +
    `1️⃣ Horarios\n` +
    `2️⃣ Precios\n` +
    `3️⃣ Ubicacion\n` +
    `4️⃣ Hablar con una persona`
  );
}

function respuestaSegunOpcion(texto) {
  const t = texto.trim();

  if (t === "1") return `🕒 *Horarios*\n${HOURS_TEXT}`;
  if (t === "2") return `💰 *Precios*\n${PRICES_TEXT}`;
  if (t === "3") return `📍 *Ubicacion*\n${LOCATION_TEXT}`;
  if (t === "4") return `🙋 *Contacto*\n${CONTACT_TEXT}`;

  // Cualquier otro mensaje: mostramos el menu.
  return buildMenu();
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "warn" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("========================================");
      console.log("QR_DATA_START");
      console.log(qr);
      console.log("QR_DATA_END");
      console.log("Este codigo vence en unos 20-30 segundos.");
      console.log("========================================");
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Conexion cerrada.", statusCode, "Reconectar:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("✅ Bot conectado a WhatsApp.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    // Ignoramos mensajes de grupos: el bot solo responde en chats 1 a 1.
    if (msg.key.remoteJid?.endsWith("@g.us")) return;

    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (!texto) return;

    const respuesta = respuestaSegunOpcion(texto);
    await sock.sendMessage(msg.key.remoteJid, { text: respuesta });
  });
}

startBot().catch((err) => {
  console.error("Error al iniciar el bot:", err);
  process.exit(1);
});
