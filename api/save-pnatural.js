import { db } from '../lib/firebaseAdmin';
import { Resend } from 'resend';

// Inicializamos Resend con la API key de las variables de entorno.
const resend = new Resend(process.env.RESEND2_API_KEY);

// Esta es la configuración de la función Serverless de Vercel.
// Desactivamos el bodyParser por defecto porque vamos a manejar FormData.
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Handler para la API que recibe y procesa el registro de una persona natural.
 */
export default async function handler(request, response) {
  // 1. VERIFICACIÓN DEL MÉTODO
  // Solo permitimos solicitudes POST a este endpoint.
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Método no permitido. Use POST.' });
  }

  try {
    // 2. PARSEO DE FORMDATA
    // request.formData() lee el cuerpo de la solicitud, que contiene
    // tanto los campos de texto como los archivos.
    const formData = await request.formData();

    // 3. EXTRACCIÓN Y VALIDACIÓN DE DATOS
    // Creamos un objeto para almacenar los datos del proveedor.
    const providerData = {
      tipo: 'Persona Natural',
      fechaRegistro: new Date().toISOString(), // Guardamos la fecha de creación
      estado: 'Recibido', // Estado inicial del proceso
    };
    
    // Lista de campos de texto esperados del formulario.
    const fields = [
      'nombreCompleto', 'cedula', 'direccion', 'pais', 'departamento',
      'ciudad', 'paisManual', 'ciudadManual', 'telefono', 'email',
      'tipoProveedor', 'regimenTributario', 'actividadEconomica',
      'responsableIva', 'entidadBancaria', 'tipoCuenta', 'numeroCuenta', 'titularCuenta'
    ];

    // Recorremos los campos, los extraemos de formData y los añadimos a nuestro objeto.
    fields.forEach(field => {
      const value = formData.get(field);
      if (value) {
        providerData[field] = value;
      }
    });

    // Validación de campos obligatorios en el backend. ¡Esto es crucial!
    const requiredFields = ['nombreCompleto', 'cedula', 'email', 'entidadBancaria', 'numeroCuenta', 'titularCuenta'];
    for (const field of requiredFields) {
      if (!providerData[field]) {
        return response.status(400).json({ message: `El campo '${field}' es obligatorio.` });
      }
    }

    // 4. MANEJO DE ARCHIVOS (METADATA POR AHORA)
    const fileCount = parseInt(formData.get('fileCount') || '0', 10);
    const filesMetadata = [];
    if (fileCount > 0) {
      for (let i = 0; i < fileCount; i++) {
        const file = formData.get(`file${i}`);
        if (file) {
          filesMetadata.push({
            name: file.name,
            size: file.size,
            type: file.type,
          });
          // TODO: Implementar subida a Firebase Storage.
          // Aquí es donde iría la lógica para subir el 'file' a un bucket de Firebase Storage
          // y obtener la URL de descarga. Esa URL se guardaría en lugar de la metadata.
          // Ejemplo: const fileUrl = await uploadToFirebaseStorage(file);
          // providerData.documentos.push({ name: file.name, url: fileUrl });
        }
      }
    }
    providerData.archivosAdjuntos = filesMetadata;

    // 5. GUARDADO EN FIRESTORE
    // Usamos la instancia 'db' de nuestro archivo de inicialización.
    const docRef = await db.collection('proveedores_naturales').add(providerData);

    // 6. NOTIFICACIÓN POR CORREO
    try {
        await resend.emails.send({
            from: 'Portal Proveedores <no-reply@tu-dominio.com>', // Configura un dominio en Resend
            to: ['admin@fundacionidi.edu.co'], // Correo del administrador
            subject: 'Nuevo Proveedor (Persona Natural) Registrado',
            html: `
                <h1>Nuevo Registro en el Portal de Proveedores</h1>
                <p>Se ha registrado un nuevo proveedor (Persona Natural):</p>
                <ul>
                    <li><strong>Nombre:</strong> ${providerData.nombreCompleto}</li>
                    <li><strong>Cédula:</strong> ${providerData.cedula}</li>
                    <li><strong>Email:</strong> ${providerData.email}</li>
                    <li><strong>Fecha de Registro:</strong> ${new Date(providerData.fechaRegistro).toLocaleString('es-CO')}</li>
                </ul>
                <p>ID del documento en Firebase: ${docRef.id}</p>
                <p>Por favor, inicie sesión en el portal de administración para revisar la solicitud.</p>
            `,
        });
    } catch (emailError) {
        console.error("Error al enviar el correo de notificación:", emailError);
        // No detenemos el proceso si el correo falla, pero lo registramos.
    }


    // 7. RESPUESTA DE ÉXITO
    return response.status(200).json({ 
      message: 'Proveedor registrado exitosamente.',
      providerId: docRef.id 
    });

  } catch (error) {
    // Manejo de errores inesperados
    console.error('Error en /api/save-pnatural:', error);
    return response.status(500).json({ message: 'Ocurrió un error en el servidor.' });
  }
}
