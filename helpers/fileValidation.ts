// Lista de extensiones de archivos ejecutables prohibidos por seguridad
const EXECUTABLE_EXTENSIONS = [
  // Ejecutables Windows
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.msi', '.msp', '.hta', '.cpl', '.msc', '.jar',
  
  // Ejecutables Linux/Unix
  '.sh', '.run', '.deb', '.rpm', '.pkg', '.dmg', '.app',
  
  // Scripts
  '.ps1', '.ps2', '.psc1', '.psc2', '.msh', '.msh1', '.msh2', '.mshxml', '.msh1xml', '.msh2xml',
  
  // Otros potencialmente peligrosos
  '.reg', '.inf', '.scf', '.lnk', '.url'
];

// Lista de tipos MIME permitidos (whitelist approach)
const ALLOWED_MIME_TYPES = [
  // Imágenes
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml',
  
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Texto
  'text/plain', 'text/csv', 'text/html', 'text/css',
  'application/json', 'application/xml',
  
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm',
  
  // Video
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  
  // Archivos comprimidos
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/gzip', 'application/x-tar'
];

interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export const validateFile = (originalname: string, mimetype: string, size: number): FileValidationResult => {
  // 1. Verificar extensión de archivo
  const fileExtension = originalname.toLowerCase().substring(originalname.lastIndexOf('.'));
  
  if (EXECUTABLE_EXTENSIONS.includes(fileExtension)) {
    return {
      isValid: false,
      error: `Tipo de archivo no permitido: ${fileExtension}. Los archivos ejecutables están prohibidos por seguridad.`
    };
  }
  
  // 2. Verificar tipo MIME
  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    return {
      isValid: false,
      error: `Tipo de archivo no permitido: ${mimetype}. Solo se permiten documentos, imágenes, audio y video seguros.`
    };
  }
  
  // 3. Verificar tamaño de archivo (máximo 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB en bytes
  if (size > maxSize) {
    return {
      isValid: false,
      error: `El archivo es demasiado grande. Tamaño máximo permitido: 50MB`
    };
  }
  
  return { isValid: true };
};

export const sanitizeFileName = (fileName: string): string => {
  // Remover caracteres peligrosos del nombre del archivo
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_') // Caracteres no permitidos en nombres de archivo
    .replace(/\s+/g, '_') // Espacios por guiones bajos
    .replace(/_+/g, '_') // Múltiples guiones bajos por uno solo
    .replace(/^_|_$/g, ''); // Remover guiones bajos del inicio y final
};
