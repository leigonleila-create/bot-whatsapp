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
const http = require("http");
const QRCode = require("qrcode");

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

// Guarda el ultimo QR generado para poder mostrarlo en /qr como imagen.
// Cada QR es valido solo unos segundos, asi que tambien guardamos un
// numero de version para saber cuando hay uno nuevo.
let lastQr = null;
let qrVersion = 0;
let isConnected = false;

// Servidor web chiquito: entrando a la URL publica + /qr se ve una
// pagina que se actualiza sola cada pocos segundos, para siempre
// mostrar el codigo QR mas nuevo sin tener que recargar a mano.
http
  .createServer(async (req, res) => {
    if (req.url === "/qr") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>QR de WhatsApp</title>
<style>
  body { background:#111; color:#eee; font-family: sans-serif; text-align:center; padding-top:40px; }
  img { background:#fff; padding:16px; border-radius:8px; }
  p { max-width:420px; margin:16px auto; }
</style>
</head>
<body>
  <h2>Escaneá este codigo con WhatsApp</h2>
  <p>La pagina se actualiza sola. Escaneá apenas lo veas: cada codigo dura pocos segundos.</p>
  <div id="contenido">Cargando...</div>
  <script>
    async function actualizar() {
      const el = document.getElementById('contenido');
      try {
        const r = await fetch('/qr-estado');
        const data = await r.json();
        if (data.conectado) {
          el.innerHTML = '<h1>&#9989; Bot conectado a WhatsApp</h1><p>Ya podes cerrar esta pagina.</p>';
          return;
        }
        if (!data.hayQr) {
          el.innerHTML = '<p>Todavia no hay QR generado. Esperando...</p>';
          return;
        }
        el.innerHTML = '<img src="/qr-image?v=' + data.version + '" width="320" height="320" alt="Codigo QR" />';
      } catch (e) {
        el.innerHTML = '<p>No se pudo cargar el estado. Reintentando...</p>';
      }
    }
    actualizar();
    setInterval(actualizar, 3000);
  </script>
</body>
</html>`);
      return;
    }

    if (req.url === "/qr-estado") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ hayQr: !!lastQr, version: qrVersion, conectado: isConnected }));
      return;
    }

    if (req.url && req.url.startsWith("/qr-image")) {
      if (!lastQr) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Todavia no hay QR generado.");
        return;
      }
      try {
        const png = await QRCode.toBuffer(lastQr, { width: 500, margin: 2 });
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        });
        res.end(png);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error generando el QR: " + err.message);
      }
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bot activo. Entra a /qr para ver el codigo QR.");
  })
  .listen(process.env.PORT || 3000, () => {
    console.log("Servidor web escuchando en el puerto", process.env.PORT || 3000);
  });

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
      lastQr = qr;
      qrVersion += 1;
      isConnected = false;
      console.log("Nuevo QR generado. Entra a la URL publica + /qr para verlo.");
    }

    if (connection === "close") {
      isConnected = false;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Conexion cerrada.", statusCode, "Reconectar:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      isConnected = true;
      lastQr = null;
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
