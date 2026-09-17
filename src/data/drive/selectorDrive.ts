/**
 * Selección de fotos desde Google Drive.
 *
 * El permiso que se pide es `drive.file`, el más estrecho que existe: solo da
 * acceso a los archivos que el propio entrenador elige en el selector, nunca a
 * su Drive entero. Google no lo considera sensible, así que la aplicación no
 * tiene que pasar por su proceso de verificación.
 *
 * Lo que se descarga NO se queda en Drive: pasa por el mismo procesado que una
 * foto local (recorte cuadrado, 256 px, WebP) y se guarda en Supabase. Drive es
 * el archivo maestro del club; la app se queda su copia ligera.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const ALCANCE = 'https://www.googleapis.com/auth/drive.file';

/** Sin las dos credenciales configuradas, el botón de Drive ni se ofrece. */
export const driveConfigurado = Boolean(CLIENT_ID && API_KEY);

/**
 * El número de proyecto de Google Cloud, que el selector necesita para que
 * `drive.file` conceda acceso al archivo elegido. Es el primer tramo del ID de
 * cliente (`123456789012-abc.apps.googleusercontent.com`), así que no hace
 * falta pedirlo aparte como una tercera credencial.
 */
const APP_ID = CLIENT_ID?.split('-')[0] ?? '';

// Los dos SDK de Google se cargan bajo demanda, no al arrancar la app: quien
// nunca abra la plantilla no paga ese peso.
const cargados = new Map<string, Promise<void>>();

function cargarScript(url: string): Promise<void> {
  const yaEsta = cargados.get(url);
  if (yaEsta) return yaEsta;
  const promesa = new Promise<void>((resolve, reject) => {
    const etiqueta = document.createElement('script');
    etiqueta.src = url;
    etiqueta.async = true;
    etiqueta.onload = () => resolve();
    etiqueta.onerror = () => reject(new Error('No se pudo contactar con Google. Comprueba tu conexión.'));
    document.head.appendChild(etiqueta);
  });
  cargados.set(url, promesa);
  return promesa;
}

interface ClienteToken {
  callback: (respuesta: { access_token?: string; error?: string }) => void;
  requestAccessToken: (opciones?: { prompt?: string }) => void;
}

interface ArchivoElegido {
  id: string;
  name: string;
  mimeType: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: { oauth2: { initTokenClient: (config: Record<string, unknown>) => ClienteToken } };
      picker?: Record<string, never>;
    };
    gapi?: { load: (nombre: string, cb: () => void) => void };
  }
}

/** Token de acceso. Google lo cachea mientras siga vivo; el usuario solo ve el diálogo la primera vez. */
function pedirToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error('No se pudo iniciar la conexión con Google.'));
      return;
    }
    const cliente = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: ALCANCE,
      callback: (respuesta: { access_token?: string; error?: string }) => {
        if (respuesta.access_token) resolve(respuesta.access_token);
        else reject(new Error(respuesta.error === 'access_denied' ? 'No diste permiso a Google Drive.' : 'Google no devolvió el permiso.'));
      },
    });
    cliente.requestAccessToken();
  });
}

function abrirSelector(token: string): Promise<ArchivoElegido | null> {
  return new Promise((resolve, reject) => {
    window.gapi?.load('picker', () => {
      // `google.picker` no trae tipos oficiales y no se añaden dependencias al
      // proyecto por esto: se accede por el objeto global con un tipo mínimo.
      const picker = (window as unknown as { google: { picker: Record<string, any> } }).google.picker;
      if (!picker) {
        reject(new Error('No se pudo abrir el selector de Google Drive.'));
        return;
      }
      const vista = new picker.DocsView(picker.ViewId.DOCS_IMAGES).setIncludeFolders(true).setSelectFolderEnabled(false);
      new picker.PickerBuilder()
        .setAppId(APP_ID)
        .setOAuthToken(token)
        .setDeveloperKey(API_KEY)
        .addView(vista)
        .setCallback((datos: { action: string; docs?: ArchivoElegido[] }) => {
          if (datos.action === picker.Action.PICKED) resolve(datos.docs?.[0] ?? null);
          else if (datos.action === picker.Action.CANCEL) resolve(null);
        })
        .build()
        .setVisible(true);
    });
  });
}

/**
 * Abre el selector de Drive y devuelve la imagen elegida como `File`, lista
 * para pasar por `procesarFotoJugador` igual que si viniera del disco.
 * Devuelve `null` si el entrenador cierra el selector sin elegir nada.
 */
export async function elegirFotoDeDrive(): Promise<File | null> {
  if (!driveConfigurado) throw new Error('Google Drive no está configurado en esta instalación.');

  await Promise.all([cargarScript('https://accounts.google.com/gsi/client'), cargarScript('https://apis.google.com/js/api.js')]);
  const token = await pedirToken();
  const elegido = await abrirSelector(token);
  if (!elegido) return null;

  const respuesta = await fetch(`https://www.googleapis.com/drive/v3/files/${elegido.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    throw new Error('No se pudo descargar la imagen de Drive. Vuelve a intentarlo.');
  }
  const blob = await respuesta.blob();
  return new File([blob], elegido.name, { type: elegido.mimeType || blob.type });
}
