# bot-whatsapp

Bot de WhatsApp basico. Cuando alguien te escribe, responde con un menu
(Horarios / Precios / Ubicacion / Hablar con una persona) y contesta segun
la opcion que elijan.

## 1. Subir estos archivos a GitHub

Subi `package.json`, `index.js`, `.gitignore`, `.env.example` y este
`README.md` a tu repo `bot-whatsapp` (carpeta raiz, no en una subcarpeta).
**No subas** una carpeta `node_modules` ni un archivo `.env` real.

Railway va a detectar el cambio y arrancar un build automaticamente.

## 2. Configurar las variables en Railway

En tu servicio de Railway, pestaña **Variables**, agrega:

- `PHONE_NUMBER`: tu numero de WhatsApp con codigo de pais, sin "+" ni
  espacios (ej: `5491112345678`).
- Opcionales: `BUSINESS_NAME`, `HOURS_TEXT`, `PRICES_TEXT`,
  `LOCATION_TEXT`, `CONTACT_TEXT` (mirá `.env.example` para ver el formato).

## 3. Vincular el bot con tu WhatsApp

1. Una vez que el deploy termine en verde, andá a la pestaña
   **Deployments** > el deploy activo > **Deploy Logs**.
2. Vas a ver un mensaje con un **codigo de emparejamiento** de 8
   caracteres.
3. En tu celular: WhatsApp > Configuracion > Dispositivos vinculados >
   Vincular un dispositivo > **Vincular con numero de telefono** en
   vez de escanear el QR, e ingresa ese codigo.
4. Cuando veas "✅ Bot conectado a WhatsApp" en los logs, ya esta
   funcionando.

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
