# bot-whatsapp

Bot del numero personal de WhatsApp de Leila. Por ese numero le escriben
por 3 motivos (**Corpore** masajes, **consultoria de IA**, **venta de
terrenos en Merida**) ademas de amigos que le escriben para charlar.

Cuando alguien escribe por primera vez, el bot (con Inteligencia
Artificial, Groq) lee ese mensaje, detecta de que tema es, y contesta UNA
sola vez con el saludo que corresponda. Si el mensaje es una charla
personal (no tiene nada que ver con los 3 temas), el bot no contesta
nada. Despues de ese primer mensaje (si lo hay), el bot queda en
silencio en esa conversacion para que Leila la siga en persona. Nunca da
precio exacto, direcciones/ubicaciones exactas ni confirma turnos o
disponibilidad: eso siempre lo coordina Leila personalmente.

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

- La primera vez que alguien te escribe, la IA lee ese mensaje y detecta
  de que tema es: Corpore, consultoria de IA, terrenos, o ninguno de los
  tres (charla personal).
- Si es de alguno de los 3 temas, manda un mensaje de bienvenida breve
  con la info de ese tema y avisa que vos le vas a responder en breve.
- Si no es de ninguno de los 3 (por ejemplo un amigo saludando), el bot
  no contesta nada: nunca se mete en una charla personal.
- Despues de ese primer mensaje (si lo hubo), el bot queda en silencio en
  esa conversacion para siempre (hasta que el servicio se reinicie), asi
  vos segui charlando en persona sin que el bot interrumpa.
- Si el bot se reinicia (por ejemplo, por un redeploy), "olvida" a quien
  ya evaluo, y va a volver a evaluar el proximo mensaje de esa persona
  como si fuera la primera vez.

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
