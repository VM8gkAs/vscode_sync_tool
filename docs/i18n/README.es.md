# FTP/SFTP/SSH Sync

> Herramienta de sincronización rápida de código

[🔥 Descargar](https://marketplace.visualstudio.com/items?itemName=oorzc.ssh-tools)

##  Supported Languages

## ✨ Funcionalidades del complemento

- [x] Soporta la configuración personalizada de múltiples entornos de desarrollo  
- [x] Soporta la sincronización de código en tiempo real  
- [x] Soporta el registro de cambios en el código y la carga manual de código  
- [x] Soporta la construcción y empaquetado automático de proyectos front-end  
- [x] Soporta la compresión y carga de código (pero solo SSH soporta la descompresión remota después de la carga)  
- [x] Soporta la confirmación en Git durante la carga  
- [x] Soporta directorios de carga personalizados y la exclusión de directorios específicos de la carga  
- [x] Soporta la carga y descarga concurrente  
- [x] Soporta pausar, reanudar y detener cargas y descargas  
- [x] Soporta la comparación de archivos locales y remotos  
- [x] Soporta la visualización de código remoto, con operaciones como agregar, eliminar, modificar, cambiar permisos, mover código, renombrar y descargar archivos  
- [x] Soporta la configuración de proxy  
- [x] Soporta la carga de archivos o carpetas arrastrando y soltando en directorios específicos del servidor  
- [x] 👍👍👍 Soporta la encriptación de cuentas y contraseñas en archivos de configuración para prevenir fugas de cuentas del servidor 👍👍👍  

## 📖 Guía de uso

1. Configuración del complemento

    - Por defecto, se ignoran los archivos y carpetas .git, .svn, .DS_Store, Thumbs.db, .idea, node_modules, runtime, sync_config.jsonc. Otros deben agregarse manualmente.
    - Si existe un archivo .gitignore, se usará su configuración para ignorar contenido durante la carga.
      ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F2a2b4adc7305c7b1c84d796da57cfe81.png)

2. Agregar configuración de proyecto
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F0aba393b99df91a094fac6c14a2aebe1.gif)

3. Configuración de proxy. Es necesario establecer proxy = true en la configuración del proyecto para que tenga efecto.
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F9f00f0451dd2c558ad469178d0058713.png)

Ejemplo de configuración de sync_config.jsonc

```jsonc
{
	// Nombre del entorno, soporta nombres personalizados
	"test": {
		// Entorno de prueba
		"type": "ftp", // (Obligatorio) Tipo de transferencia, soporta ftp, sftp, ssh
		"host": "0.0.0.0", // (Obligatorio) Dirección del servidor
		"port": 22, // (Opcional) Puerto, por defecto 21 para ftp, 22 para sftp y ssh
		"username": "username", // (Obligatorio) Nombre de usuario
		"password": "password", // Contraseña (o ruta de la clave privada, una de las dos)
		// "privateKeyPath": "/your_path/id_rsa", // (Configuración de sftp, ssh) Ruta de la clave privada (o contraseña, una de las dos), no se recomienda colocar la clave en la raíz del proyecto
		// "secretKeyPath": "/your_path/secret_key.txt", // Ruta de la clave privada de cifrado, utilizada para cifrar nombres de usuario y contraseñas. Nota: Es mejor no colocar la clave en el directorio del código.
		"proxy": false, // Usar proxy, por defecto false
		"upload_on_save": false, // Cargar automáticamente al guardar, recomendado para desarrollo individual. Si es true, watch, submit_git_before_upload, compress, deleteRemote no tienen efecto. Por defecto false
		"watch": false, // Monitorear cambios en los archivos del directorio de carga, por defecto true. Si upload_on_save es true, este parámetro no tiene efecto. Si se configura distPath, solo se monitorean los cambios en ese directorio
		"submit_git_before_upload": true, // Para desarrollo en equipo, confirmar cambios en git local antes de cargar para evitar sobrescribir código remoto, por defecto false
		"submit_git_msg": "", // Mensaje de confirmación en git, por defecto vacío. Si submit_git_before_upload es true y no se especifica, se mostrará un cuadro de diálogo para ingresar el mensaje
		// "build": "yarn build:test", // (Opcional) Comando de construcción para proyectos frontend
		"compress": true, // Comprimir antes de cargar, por defecto false
		//"remote_unpacked": true, // Descomprimir en el servidor después de la carga (requiere soporte ssh), por defecto true para ssh, false para otros
		//"delete_remote_compress": true, // Eliminar archivo comprimido en el servidor después de la carga, por defecto true para ssh, false para otros
		//"delete_local_compress": true, // Eliminar archivo comprimido local después de la carga, por defecto true
		"distPath": [], // (Opcional) Directorio local a cargar, soporta cadena o arreglo, por defecto carga la raíz del proyecto
		"upload_to_root": false, // Si distPath tiene un solo directorio, cargar en la raíz de remotePath, útil para despliegue de código frontend, por defecto false
		"deleteRemote": false, // Eliminar directorio remoto configurado en distPath antes de cargar, útil para limpiar código frontend desplegado, por defecto false
		"remotePath": "/www/wwwroot/test", // (Configuración de sftp, ssh) Ruta en el servidor
		"excludePath": [], // (Opcional) Archivos y directorios a excluir en este entorno, se combina con excludePath del complemento. Si se usa .gitignore, se combina con su configuración
		// "downloadPath": "" // (Opcional) Ruta de descarga, por defecto la raíz del proyecto, se usa para descargar archivos o carpetas manualmente
		// "downloadExcludePath": [], //  (Opcional) Archivos y directorios a excluir durante la descarga
		"default": true // Si es el entorno por defecto, permite usar el menú contextual para cargar archivos o carpetas rápidamente, comparar archivos remotos, por defecto false
	},
	"online": {
		// Entorno de producción
		"type": "sftp",
		"host": "0.0.0.0",
		"port": 22,
		"proxy": true,
		"username": "username",
		"password": "password",
		// "privateKeyPath": "/your_path/id_rsa",
		"upload_on_save": false,
		"watch": false,
		"submit_git_before_upload": true,
		"submit_git_msg": "",
		// "build": "yarn build:online",
		"compress": false,
		//"remote_unpacked": false,
		//"delete_remote_compress": true,
		"upload_to_root": false,
		"deleteRemote": false,
		"distPath": [],
		"remotePath": "/www/wwwroot/online",
		"excludePath": [],
		// "downloadPath": "",
	   // "downloadExcludePath": [],
		"default": false
	}
}
```

### Prioridad de autenticación y errores de validación

- Para `sftp` / `ssh`, primero se intenta `privateKeyPath`; si no está disponible, se usa `password`.
- Para `ftp`, solo se admite autenticación por `password`.
- Mensajes de validación en tiempo de ejecución:

```text
FTP only supports password authentication. Please configure [password]
The configured [privateKeyPath] does not exist, and [password] is empty. Please provide a valid private key file or password
Please configure authentication: [privateKeyPath] (preferred) or [password]
```

```js
// excludePath, downloadExcludePath reglas de exclusión, soporta comodines
[
	"**/*.mp4",
	"aaa/bbb", // Excluir aaa/bbb
	"!aaa/bbb/ccc", // No excluir la carpeta ccc dentro de aaa/bbb
]
```

## Demostración de carga

Demostración de carga
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F8f85ff0142ef082749b55f7db3c8bf13.gif)

Demostración de comparación de archivos
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F6cbd149ae7959c8097ce288fb91ed800.gif)

## Aviso Amistoso

1. Si no puede conectarse al servidor, puede intentar usar otras herramientas de conexión como xftp, filezilla, etc. para conectarse al servidor. Una vez confirmado, puede intentar conectarse nuevamente.
2. Después de subir archivos, si el menú de árbol no se actualiza, puede usar el menú contextual para actualizar el árbol de archivos.
3. ¿Por qué no se descarga el archivo del servidor al volver a abrirlo? Para ahorrar recursos, el complemento almacena en caché los archivos abiertos. Si necesita actualizar el archivo, use el menú contextual y actualícelo.
4. ¿Por qué no se pueden descifrar el nombre de usuario o la contraseña? Su clave ha sido modificada. Vuelva a ingresar la contraseña de la cuenta inicial y cifre/descifre nuevamente.
5. Cada vez que edita el archivo de configuración, todas las tareas se detienen automáticamente. Por lo tanto, no modifique el archivo de configuración aleatoriamente durante el proceso de carga.

## Reporte de problemas

Este proyecto se desarrolla en tiempo libre. Puedes reportar problemas aquí, pero no se garantiza una solución inmediata.

## Build Commands

~~~bash
# install dependencies
npm install

# development watch build
npm run watch

# production build (output: dist/extension.js)
npm run package

# package VSIX (output: ssh-tools-<version>.vsix)
npx @vscode/vsce package --no-dependencies
~~~

- npm run package only builds the extension bundle, it does not generate a .vsix file.
- npm run vscepackage requires globally installed vsce; if not installed, prefer npx @vscode/vsce package --no-dependencies.
[Reportar problema](https://github.com/oorzc/vscode_sync_tool/issues)

