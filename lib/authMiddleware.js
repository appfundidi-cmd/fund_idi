import jwt from 'jsonwebtoken';
import cookie from 'cookie';

/**
 * Middleware para verificar la autenticación a través de un token JWT en una cookie.
 * Este es el "guardián" que protegerá las rutas de la API que requieren autenticación.
 * @param {Request} request - El objeto de la solicitud entrante.
 * @returns {object} La información decodificada del token si es válido.
 * @throws {Error} Si el token no se encuentra, es inválido o ha expirado.
 */
export function verifyAuth(request) {
    // 'cookie.parse' convierte el string de cookies del header en un objeto.
    const cookies = cookie.parse(request.headers.get('cookie') || '');
    const token = cookies.authToken;

    // Si no existe la cookie 'authToken', negamos el acceso inmediatamente.
    if (!token) {
        throw new Error('Token de autenticación no encontrado.');
    }

    try {
        // Usamos la clave secreta (almacenada de forma segura en las variables de entorno de Vercel)
        // para verificar la firma del token. Si la firma es inválida, el token ha sido
        // manipulado. Si ha expirado, también lanzará un error.
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded; // Si todo es correcto, devolvemos los datos del usuario (payload).
    } catch (error) {
        // Capturamos cualquier error de la verificación.
        throw new Error('Token inválido o expirado.');
    }
}
