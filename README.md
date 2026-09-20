# bot-whatsapp

Bot de WhatsApp de **Corpore** (masajes y terapias corporales). Cuando
alguien le escribe a Leila por primera vez, el bot contesta con UN solo
mensaje de bienvenida generado con Inteligencia Artificial (Groq), usando
la info del negocio. Despues de ese mensaje queda en silencio en esa
conversacion, para que Leila la siga en persona. Nunca da precio exacto,
direccion exacta ni confirma turnos: esas tres cosas siempre las coordina
Leila personalmente.

## 1. Subir estos archivos a GitHub

Subi `package.json`, `index.js`, `.gitignore`, `.env.example` y este
`README.md` a tu repo `bot-whatsapp` (carpeta raiz, no en una subcarpeta).
**No subas** una carpeta `node_modules` ni un archivo `.env` real.

Railway va a detectar el cambio y arrancar un build automaticamente.

## 2. Configurar las variables en Railway

En tu servicio de Railway, pestaña **Variables**, agrega:

- `GROQ_API_KEY`: tu clave gratuita de https://console.groq.com/keys
- Opcionales: `GROQ_MODEL`, `BUSINESS_NAME`, `SERVICES_TEXT`,
  `PAYMENT_TEXT` (mirá `.env.example` para ver el formato).

## 3. Vincular el bot con tu WhatsApp

1. Una vez que el deploy termine en verde, entra a la URL publica del
   servicio + `/qr` (por ejemplo `tu-servicio.up.railway.app/qr`).
2. Vas a ver un codigo QR que se actualiza solo.
3. En tu celular: WhatsApp > Configuracion > Dispositivos vinculados >
   Vincular un dispositivo, y apunta la camara al QR de la pantalla.
4. Cuando la pagina diga "✅ Bot conectado a WhatsApp", ya esta
   funcionando.

## Como se comporta

- La primera vez que alguien te escribe, el bot manda un mensaje de
  bienvenida (con IA) contando los servicios y avisando que vos le vas
  a responder en breve.
- Despues de ese primer mensaje, el bot queda en silencio en esa
  conversacion para siempre (hasta que el servicio se reinicie), asi
  vos segui charlando en persona sin que el bot interrumpa.
- Si el bot se reinicia (por ejemplo, por un redeploy), "olvida" a quien
  ya saludo, y le va a volver a mandar el mensaje de bienvenida la
  proxima vez que esa persona escriba.

## Importante: la sesion no es permanente

El bot guarda la sesion de WhatsApp en una carpeta (`auth_info`) dentro
del propio servicio. En el plan gratuito de Railway, esa carpeta se
puede borrar en cada redeploy, y ahi vas a tener que volver a vincular
con un codigo nuevo. Si eso te pasa seguido, avisame y le agregamos un
volumen (como el que ya tenés en Postgres) para que la sesion quede
guardada siempre.

## Cambiar los textos de las respuestas

No hace falta tocar el codigo: cambiá las variables en la pestaña
Variables de Railway (`HOURS_TEXT`, `PRICES_TEXT`, etc.) y el servicio
se reinicia solo con los textos nuevos.
