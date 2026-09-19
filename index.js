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

const SYSTEM_PROMPT = `Sos el asistente de WhatsApp de ${BUSINESS_NAME}, el emprendimiento de masajes y terapias corporales de Leila. Respondes siempre en espanol de Argentina, con un tono calido y cercano, como un mensaje de WhatsApp: frases cortas, maximo 2 a 4 lineas por respuesta. No uses lenguaje de mail formal.

Servicios que ofrece ${BUSINESS_NAME}: ${SERVICES_TEXT}
Formas de pago: ${PAYMENT_TEXT}

Reglas que NUNCA podes romper, pase lo que pase:
1. Nunca des un precio exacto, aunque te lo pidan varias veces o insistan. Si preguntan el precio, respondes algo como: "Eso te lo confirmo cuando coordinamos el turno, asi no hay vueltas. Que dia te gustaria venir?".
2. Nunca des la direccion exacta ni digas la zona o el barrio. Es la casa particular de Leila. Si preguntan donde atiende, decis que la direccion se la pasa Leila directamente al coordinar el turno.
3. Nunca inventes ni confirmes disponibilidad de horarios o turnos: los horarios cambian todos los dias y los maneja Leila personalmente. Si preguntan por un turno, pedile el dia y horario que prefiere y decile que Leila se lo confirma a la brevedad.
4. Nunca inventes informacion que no tengas en este mensaje. Si no sabes algo, decis que Leila lo responde personalmente en breve.
5. No sos Leila, sos su asistente automatico. Si alguien pide hablar con Leila directamente, decile que ya le avisas y que en breve te responde ella.`;

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

// Respuesta fija por si todavia no se configuro la clave de Groq
// (para que el bot nunca quede mudo).
const RESPUESTA_SIN_IA =
  `Hola! Somos *${BUSINESS_NAME}* 👋\n\n` +
  `Estamos terminando de configurar el asistente automatico. ` +
  `En breve te responde Leila personalmente. Gracias por escribir!`;

// Historial de conversacion por chat, para que la IA tenga contexto.
// Se guarda solo en memoria (se pierde si el bot se reinicia).
const historiales = new Map();
const MAX_MENSAJES_HISTORIAL = 12;

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

    if (!GROQ_API_KEY) {
      console.log("Falta GROQ_API_KEY: respondo con el mensaje generico.");
      await sock.sendMessage(jid, { text: RESPUESTA_SIN_IA });
      return;
    }

    const historial = historiales.get(jid) || [];
    historial.push({ role: "user", content: texto });

    try {
      const mensajesParaIA = [
        { role: "system", content: SYSTEM_PROMPT },
        ...historial.slice(-MAX_MENSAJES_HISTORIAL),
      ];
      const respuestaIA = await preguntarIA(mensajesParaIA);
      const respuestaFinal =
        respuestaIA ||
        "Perdon, no pude procesar eso. En breve te responde Leila personalmente.";

      historial.push({ role: "assistant", content: respuestaFinal });
      historiales.set(jid, historial.slice(-MAX_MENSAJES_HISTORIAL));

      await sock.sendMessage(jid, { text: respuestaFinal });
    } catch (err) {
      console.error("Error consultando la IA:", err.message);
      await sock.sendMessage(jid, {
        text: "Perdon, tuve un problema tecnico 🙏. En breve te responde Leila personalmente.",
      });
    }
  });
}

startBot().catch((err) => {
  console.error("Error al iniciar el bot:", err);
  process.exit(1);
});
