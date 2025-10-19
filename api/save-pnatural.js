import { db } from '../../lib/firebaseAdmin';
import { Resend } from 'resend';
import { v2 as cloudinary } from 'cloudinary';
import formidable from 'formidable';

// Configuración de Resend para correos
const resend = new Resend(process.env.RESEND2_API_KEY);

// Configuración de Cloudinary (toma la configuración de la variable de entorno CLOUDINARY_URL)
cloudinary.config({ secure: true });

export const config = {
  api: {
    bodyParser: false, // Esencial para que Vercel maneje la carga de archivos
  },
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Método no permitido. Use POST.' });
  }

  try {
    const form = formidable({});
    const [fields, files] = await form.parse(request);

    // Normaliza los campos de texto recibidos del formulario
    const providerData = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
    );
    
    // Añade metadatos del servidor
    providerData.tipo = 'Persona Natural';
    providerData.fechaRegistro = new Date().toISOString();
    providerData.estado = 'Recibido';

    // --- Validación de Backend (Capa de Seguridad Crítica) ---
    const requiredFields = ['nombreCompleto', 'tipoDocumento', 'cedula', 'email', 'telefono', 'direccion', 'pais', 'entidadBancaria', 'numeroCuenta'];
    for (const field of requiredFields) {
      if (!providerData[field]) {
        return response.status(400).json({ message: `El campo de texto '${field}' es obligatorio.` });
      }
    }

    // Validación condicional para campos de geolocalización
    if (providerData.pais === 'Colombia') {
        if (!providerData.departamento || !providerData.ciudad) {
            return response.status(400).json({ message: 'Departamento y Ciudad son obligatorios para Colombia.' });
        }
    } else if (providerData.pais === 'Otro') {
        if (!providerData.paisManual || !providerData.ciudadManual) {
            return response.status(400).json({ message: 'País (Manual) y Ciudad (Manual) son obligatorios.' });
        }
    }


    // --- Lógica de Carga de Archivos Específicos con Cloudinary ---
    const uploadedFileUrls = [];
    const expectedFiles = [
        { name: 'docIdentidad', label: 'Documento de Identidad', required: true },
        { name: 'rutFile', label: 'RUT', required: true },
        { name: 'certBancario', label: 'Certificado Bancario', required: true },
        { name: 'hojaVida', label: 'Hoja de Vida', required: false },
        { name: 'certEPS', label: 'Certificado Afiliacion EPS', required: false },
        { name: 'certPension', label: 'Certificado Afiliacion Pension', required: false }
    ];

    for (const expectedFile of expectedFiles) {
        const fileArray = files[expectedFile.name];
        if (fileArray && fileArray.length > 0) {
            const file = fileArray[0];
            try {
                const result = await cloudinary.uploader.upload(file.filepath, {
                    folder: `portal_idi/natural/${providerData.cedula}`,
                    public_id: `${expectedFile.label.replace(/ /g, '_')}`,
                    resource_type: 'auto'
                });
                uploadedFileUrls.push({
                    documento: expectedFile.label,
                    nombreArchivoOriginal: file.originalFilename,
                    url: result.secure_url,
                });
            } catch (uploadError) {
                console.error(`Error al subir ${expectedFile.label}:`, uploadError);
                return response.status(500).json({ message: `Error al subir el archivo: ${expectedFile.label}.` });
            }
        } else if (expectedFile.required) {
            return response.status(400).json({ message: `El archivo '${expectedFile.label}' es obligatorio.` });
        }
    }
    
    providerData.archivosAdjuntos = uploadedFileUrls;

    // --- Guardado en Firestore ---
    const docRef = await db.collection('proveedores_naturales').add(providerData);

    // --- Lógica de Doble Notificación por Correo ---
    const adminEmail = 'proyectos@fundacionidi.org';
    const providerEmail = providerData.email;

    await resend.emails.send({
      from: 'Portal IDI <proyectos@emcotic.com>',
      to: [adminEmail],
      subject: `Nuevo Proveedor Registrado: ${providerData.nombreCompleto}`,
      html: `<h1>Nuevo Registro en el Portal de Proveedores</h1><p>Se ha registrado un nuevo proveedor (Persona Natural):</p><ul><li><strong>Nombre:</strong> ${providerData.nombreCompleto}</li><li><strong>Documento:</strong> ${providerData.tipoDocumento} ${providerData.cedula}</li><li><strong>Email:</strong> ${providerData.email}</li><li><strong>Teléfono:</strong> ${providerData.telefono}</li></ul><p>ID del documento en Firestore: ${docRef.id}</p>`,
    });

    await resend.emails.send({
      from: 'Fundación IDI <proyectos@emcotic.com>',
      to: [providerEmail],
      subject: 'Confirmación de Recepción de Documentos - Fundación IDI',
      html: `<h1>Hemos recibido su información</h1><p>Hola ${providerData.nombreCompleto},</p><p>Confirmamos que hemos recibido sus documentos a satisfacción y nuestro equipo procederá a revisarlos para continuar con el proceso de vinculación.</p><p>Cualquier inquietud, puede comunicarse con nosotros al correo <strong>${adminEmail}</strong> o al número <strong>3175103393</strong>.</p><br><p>Atentamente,<br><strong>Equipo de la Fundación IDI</strong></p>`,
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

