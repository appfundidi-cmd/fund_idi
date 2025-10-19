import { db } from '../../lib/firebaseAdmin';
import { Resend } from 'resend';
import { v2 as cloudinary } from 'cloudinary';
import formidable from 'formidable';

// Configuración de Resend para correos
const resend = new Resend(process.env.RESEND2_API_KEY);

// Configuración de Cloudinary (toma la configuración de la variable de entorno CLOUDINARY_URL)
cloudinary.config({
  secure: true,
});

// Vercel necesita esta configuración para manejar la carga de archivos
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Método no permitido. Use POST.' });
  }

  try {
    const form = formidable({});
    const [fields, files] = await form.parse(request);

    // Normalizamos los datos del formulario
    const providerData = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
    );
    
    providerData.tipo = 'Persona Natural';
    providerData.fechaRegistro = new Date().toISOString();
    providerData.estado = 'Recibido';

    // Validación de backend
    const requiredFields = ['nombreCompleto', 'cedula', 'email', 'telefono', 'entidadBancaria', 'numeroCuenta'];
    for (const field of requiredFields) {
      if (!providerData[field]) {
        return response.status(400).json({ message: `El campo '${field}' es obligatorio.` });
      }
    }

    // --- LÓGICA DE CARGA DE ARCHIVOS CON CLOUDINARY ---
    const uploadedFileUrls = [];
    const fileKeys = Object.keys(files);

    for (const key of fileKeys) {
      const fileArray = files[key];
      if (fileArray && fileArray.length > 0) {
        const file = fileArray[0];
        try {
          const result = await cloudinary.uploader.upload(file.filepath, {
            folder: `portal_idi/natural/${providerData.cedula}`,
            public_id: file.originalFilename,
            resource_type: 'auto'
          });
          uploadedFileUrls.push({
            nombre: file.originalFilename,
            url: result.secure_url,
            tipo: file.mimetype,
          });
        } catch (uploadError) {
          console.error("Error al subir archivo a Cloudinary:", uploadError);
          // Si un archivo falla, podemos decidir si continuar o detener todo el proceso
          return response.status(500).json({ message: 'Error al subir uno de los archivos.' });
        }
      }
    }
    
    providerData.archivosAdjuntos = uploadedFileUrls;

    // Guardado en Firestore
    const docRef = await db.collection('proveedores_naturales').add(providerData);

    // --- LÓGICA DE DOBLE NOTIFICACIÓN POR CORREO ---
    const adminEmail = 'proyectos@fundacionidi.org'; // Correo del administrador de IDI
    const providerEmail = providerData.email; // Correo del proveedor

    // 1. Correo para el Administrador de IDI
    await resend.emails.send({
      from: 'Portal IDI <onboarding@resend.dev>', // Usar un dominio verificado en Resend
      to: [adminEmail],
      subject: `Nuevo Proveedor Registrado: ${providerData.nombreCompleto}`,
      html: `
        <h1>Nuevo Registro en el Portal de Proveedores</h1>
        <p>Se ha registrado un nuevo proveedor (Persona Natural):</p>
        <ul>
          <li><strong>Nombre:</strong> ${providerData.nombreCompleto}</li>
          <li><strong>Cédula:</strong> ${providerData.cedula}</li>
          <li><strong>Email:</strong> ${providerData.email}</li>
          <li><strong>Teléfono:</strong> ${providerData.telefono}</li>
        </ul>
        <p>Los documentos adjuntos han sido cargados y están listos para revisión en el portal de administración.</p>
        <p>ID del documento en Firebase: ${docRef.id}</p>
      `,
    });

    // 2. Correo de Confirmación para el Proveedor
    await resend.emails.send({
      from: 'Fundación IDI <onboarding@resend.dev>', // Usar un dominio verificado en Resend
      to: [providerEmail],
      subject: 'Confirmación de Recepción de Documentos - Fundación IDI',
      html: `
        <h1>Hemos recibido su información</h1>
        <p>Hola ${providerData.nombreCompleto},</p>
        <p>Confirmamos que hemos recibido sus documentos a satisfacción y nuestro equipo procederá a revisarlos para continuar con el proceso de vinculación.</p>
        <p>El proceso de revisión puede tardar algunos días hábiles.</p>
        <p>Cualquier inquietud, puede comunicarse con nosotros al correo <strong>${adminEmail}</strong> o al número <strong>3175103393</strong>.</p>
        <br>
        <p>Atentamente,</p>
        <p><strong>Equipo de la Fundación IDI</strong></p>
      `,
    });

    return response.status(200).json({
      message: 'Proveedor registrado exitosamente.',
      providerId: docRef.id
    });

  } catch (error) {
    console.error('Error en /api/save-pnatural:', error);
    return response.status(500).json({ message: 'Ocurrió un error en el servidor.', error: error.message });
  }
}

