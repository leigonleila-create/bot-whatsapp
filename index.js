/**
 * Bot de WhatsApp de Corpore (masajes y terapias corporales).
 * Responde con Inteligencia Artificial (Groq) usando la info del negocio,
 * respetando reglas fijas: nunca da precio exacto, nunca da la direccion
 * exacta (es la casa de Leila) y nunca inventa disponibilidad de turnos.
 * Esas tres cosas siempre las confirma Leila personalmente.
 *
 * Toda la info se configura con variables de entorno, asi no hay que
 * tocar el codigo para cambiar los textos.
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
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Corpore";
const SERVICES_TEXT =
  process.env.SERVICES_TEXT ||
  "Masaje completo, masaje relajante, reflexologia y depilacion.";
const PAYMENT_TEXT = process.env.PAYMENT_TEXT || "Efectivo o transferencia.";

// ---- Groq (IA) ----
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `Sos el asistente automatico de WhatsApp de ${BUSINESS_NAME}, el emprendimiento de masajes y terapias corporales de Leila.

Tu unica tarea es escribir UN solo mensaje de bienvenida para alguien que le escribe a Leila por primera vez. Despues de este mensaje no participas mas en esa conversacion: a partir de ahi responde Leila en persona.

Ese mensaje de bienvenida tiene que, en espanol de Argentina, con tono calido y cercano (estilo WhatsApp: frases cortas, maximo 2 a 4 lineas, sin lenguaje de mail formal):
- Agradecer que haya escrito.
- Contar brevemente que servicios ofrece ${BUSINESS_NAME}: ${SERVICES_TEXT}
- Mencionar las formas de pago: ${PAYMENT_TEXT}
- Avisar que Leila le responde personalmente en breve para coordinar lo que necesite.

Reglas que NUNCA podes romper:
1. Nunca des un precio exacto. Eso lo confirma Leila cuando coordina el turno.
2. Nunca des la direccion exacta ni la zona o el barrio. Es la casa particular de Leila, no tiene local.
3. Nunca inventes ni confirmes disponibilidad de horarios o turnos: eso lo maneja Leila personalmente.
4. Nunca inventes informacion que no tengas en este mensaje.
5. No sos Leila, sos su asistente automatico. No sigas la conversacion mas alla del mensaje de bienvenida.`;

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

// Respuesta fija de emergencia (si todavia no se configuro Groq, o si la
// IA falla). Asi el bot nunca queda mudo con el primer mensaje.
const RESPUESTA_SIN_IA =
  `Hola! Somos *${BUSINESS_NAME}* 👋\n\n` +
  `Gracias por escribir. En breve te responde Leila personalmente. ` +
  `Servicios: ${SERVICES_TEXT}`;

// Chats a los que ya les mandamos el mensaje de bienvenida. El bot solo
// contesta la PRIMERA vez que alguien escribe; despues queda en silencio
// para que Leila siga la conversacion en persona.
// Se guarda solo en memoria (se reinicia si el bot se reinicia/redeploya).
const chatsSaludados = new Set();

async function preguntarIA(mensajes) {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: mensajes,
      temperature: 0.4,
      max_tokens: 300,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Groq respondio ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim();
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

    const jid = msg.key.remoteJid;

    // Si ya le mandamos el mensaje de bienvenida a este chat, no contestamos
    // de nuevo: a partir de ahi sigue Leila en persona.
    if (chatsSaludados.has(jid)) return;
    chatsSaludados.add(jid);

    if (!GROQ_API_KEY) {
      console.log("Falta GROQ_API_KEY: respondo con el mensaje generico.");
      await sock.sendMessage(jid, { text: RESPUESTA_SIN_IA });
      return;
    }

    try {
      const mensajesParaIA = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: texto },
      ];
      const respuestaIA = await preguntarIA(mensajesParaIA);
      await sock.sendMessage(jid, { text: respuestaIA || RESPUESTA_SIN_IA });
    } catch (err) {
      console.error("Error consultando la IA:", err.message);
      await sock.sendMessage(jid, { text: RESPUESTA_SIN_IA });
    }
  });
}

startBot().catch((err) => {
  console.error("Error al iniciar el bot:", err);
  process.exit(1);
});
