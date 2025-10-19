import admin from 'firebase-admin';

// Esta sección verifica si la app de Firebase ya fue inicializada.
// Esto es crucial en un entorno serverless para evitar inicializar la app
// en cada invocación de una función, lo cual sería ineficiente.
if (!admin.apps.length) {
  try {
    // Vercel almacena las variables de entorno. Leemos la clave que configuraste.
    // La clave está en Base64, así que primero la decodificamos a un string JSON.
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!serviceAccountBase64) {
      throw new Error('La variable de entorno FIREBASE_SERVICE_ACCOUNT_BASE64 no está definida.');
    }
    const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-cvc');
    const serviceAccount = JSON.parse(serviceAccountJson);

    // Inicializamos la app de Firebase Admin con las credenciales.
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Error al inicializar Firebase Admin SDK:', error);
    // En un caso real, podrías querer manejar este error de forma más robusta.
  }
}

// Exportamos la instancia del Firestore para usarla en nuestras funciones de API.
// También exportamos la instancia de 'admin' por si necesitamos otras funciones de Firebase.
export const db = admin.firestore();
export default admin;
