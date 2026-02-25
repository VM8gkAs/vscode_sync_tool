# FTP/SFTP/SSH Sync 

> Strumento di sincronizzazione rapida del codice

[🔥 Scarica qui](https://marketplace.visualstudio.com/items?itemName=oorzc.ssh-tools)

##  Supported Languages

## ✨ Funzionalità dell'estensione

- [x] Supporta la configurazione personalizzata di più ambienti di sviluppo  
- [x] Supporta la sincronizzazione del codice in tempo reale  
- [x] Supporta il tracciamento delle modifiche al codice e il caricamento manuale del codice  
- [x] Supporta la costruzione e il packaging automatici di progetti front-end  
- [x] Supporta la compressione e il caricamento del codice (ma solo SSH supporta la decompressione remota dopo il caricamento)  
- [x] Supporta il commit su Git durante il caricamento  
- [x] Supporta directory di caricamento personalizzate e l'esclusione di directory specifiche dal caricamento  
- [x] Supporta il caricamento e il download simultanei  
- [x] Supporta la pausa, la ripresa e l'arresto di caricamenti e download  
- [x] Supporta il confronto di file locali e remoti  
- [x] Supporta la visualizzazione del codice remoto, con operazioni come aggiungere, eliminare, modificare, cambiare permessi, spostare codice, rinominare e scaricare file  
- [x] Supporta le impostazioni del proxy  
- [x] Supporta il caricamento di file o cartelle trascinando e rilasciando in directory specifiche del server  
- [x] 👍👍👍 Supporta la crittografia di account e password nei file di configurazione per prevenire perdite di account del server 👍👍👍  

## 📖 Guida all'uso

1. Configurazione dell'estensione

    - Ignora automaticamente i file e le cartelle .git, .svn, .DS_Store, Thumbs.db, .idea, node_modules, runtime, sync_config.jsonc. Aggiungi manualmente altri file o cartelle da ignorare.
    - Se esiste un file .gitignore, verrà utilizzato automaticamente per ignorare i contenuti durante il caricamento.
      ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F2a2b4adc7305c7b1c84d796da57cfe81.png)

2. Aggiungi la configurazione del progetto
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F0aba393b99df91a094fac6c14a2aebe1.gif)

3. Impostazioni del proxy. È necessario impostare proxy = true nella configurazione del progetto per attivarlo.
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F9f00f0451dd2c558ad469178d0058713.png)

Configurazione di riferimento per sync_config.jsonc

```jsonc
{
	// Nome dell'ambiente, supporta nomi personalizzati
	"test": {
		// Ambiente di test
		"type": "ftp", // (obbligatorio) Tipo di trasferimento, supporta ftp, sftp, ssh
		"host": "0.0.0.0", // (obbligatorio) Indirizzo del server
		"port": 22, // (opzionale) Porta, ftp predefinita 21, sftp e ssh predefinita 22
		"username": "username", // (obbligatorio) Nome utente
		"password": "password", // Password (scegliere tra password e percorso della chiave privata)
		// "privateKeyPath": "/your_path/id_rsa", // (configurazione sftp, ssh) Percorso della chiave privata (scegliere tra password e percorso della chiave privata). Attenzione: è consigliabile non salvare la chiave nella directory principale del codice
		// "secretKeyPath": "/your_path/secret_key.txt", // Percorso della chiave privata di crittografia, utilizzata per crittografare nomi utente e password. Nota: È meglio non posizionare la chiave nella directory del codice.
		"proxy": false, // Usare un proxy, predefinito false
		"upload_on_save": false, // Caricamento automatico dopo il salvataggio, consigliato per lo sviluppo individuale. Se upload_on_save è true, watch, submit_git_before_upload, compress, deleteRemote non saranno validi. Predefinito false
		"watch": false, // Monitora le modifiche ai file nella directory di caricamento, predefinito true. Se upload_on_save è true, questa opzione non sarà valida. Se è configurata una directory distPath, verranno monitorate solo le modifiche in quella directory
		"submit_git_before_upload": true, // Per lo sviluppo di squadra, esegue il commit di git locale prima del caricamento per evitare la sovrascrittura del codice remoto. Predefinito false
		"submit_git_msg": "", // Messaggio di commit per git, predefinito vuoto. Se submit_git_before_upload è true e non viene inserito un messaggio, verrà mostrata una finestra di dialogo per inserirlo manualmente
		// "build": "yarn build:test", // (opzionale) Comando di build per progetti frontend
		"compress": true, // Comprimere i file prima del caricamento, predefinito false
		//"remote_unpacked": true, // Decomprimere i file caricati sul server (richiede supporto ssh). Predefinito true per ssh, false per altri
		//"delete_remote_compress": true, // Eliminare il file compresso remoto dopo il caricamento. Predefinito true per ssh, false per altri
		//"delete_local_compress": true, // Eliminare il file compresso locale dopo il caricamento. Predefinito true
		"distPath": [], // (opzionale) Directory locale da caricare, supporta stringhe o array. Predefinito: directory principale
		"upload_to_root": false, // Se distPath contiene una sola directory, i file verranno caricati nella root di remotePath. Utile per il deployment di codice frontend. Predefinito false
		"deleteRemote": false, // Eliminare la directory remota configurata in distPath prima del caricamento. Utile per la pulizia del codice di deployment frontend. Predefinito false
		"remotePath": "/www/wwwroot/test", // (configurazione sftp, ssh) Directory remota su server
		"excludePath": [], // (opzionale) File e directory da escludere per questo ambiente. Verranno uniti alle esclusioni configurate nell'estensione. Se viene utilizzato .gitignore, verrà unito al file .gitignore
		// "downloadPath": "" // (opzionale) Directory di download, predefinita alla directory principale del progetto. Utilizzata per il download manuale di file o cartelle
		// "downloadExcludePath": [], //  (opzionale) File e directory da escludere durante il download
		"default": true // Ambiente predefinito. Se true, è possibile utilizzare il menu contestuale per caricare rapidamente file o cartelle, confrontare file remoti. Predefinito false
	},
	"online": {
		// Ambiente di produzione
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

### Priorità di autenticazione ed errori di validazione

- Per `sftp` / `ssh`, l'autenticazione prova prima `privateKeyPath`; se non disponibile, usa `password` come fallback.
- Per `ftp`, è supportata solo l'autenticazione con `password`.
- Messaggi di validazione a runtime:

```text
FTP only supports password authentication. Please configure [password]
The configured [privateKeyPath] does not exist, and [password] is empty. Please provide a valid private key file or password
Please configure authentication: [privateKeyPath] (preferred) or [password]
```

```js
// Regole di esclusione per excludePath, downloadExcludePath, supportano wildcard
[
	"**/*.mp4",
	"aaa/bbb", // Escludi aaa/bbb
	"!aaa/bbb/ccc", // Non escludere la cartella ccc sotto aaa/bbb
]
```

## Dimostrazione di caricamento

Dimostrazione di caricamento
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F8f85ff0142ef082749b55f7db3c8bf13.gif)

Dimostrazione di confronto file
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F6cbd149ae7959c8097ce288fb91ed800.gif)

## Promemoria Gentile

1. Se non riesci a connetterti al server, puoi provare a utilizzare altri strumenti di connessione come xftp, filezilla, ecc. per connetterti al server. Una volta confermato, puoi provare a connetterti di nuovo.
2. Dopo aver caricato i file, se il menu ad albero non viene aggiornato, puoi utilizzare il menu contestuale per aggiornare l'albero dei file.
3. Perché il file non viene scaricato dal server quando lo riapri? Per risparmiare risorse, il plug-in memorizza nella cache i file aperti. Se è necessario aggiornare il file, utilizzare il menu contestuale e aggiornarlo.
4. Perché non è possibile decrittare il nome utente o la password? La tua chiave è stata modificata. Reinserisci la password dell'account iniziale e cifra/decifra nuovamente.
5. Ogni volta che modifichi il file di configurazione, tutte le attività vengono automaticamente interrotte. Pertanto, non modificare il file di configurazione durante il processo di caricamento.

## Segnalazione problemi

Questo progetto è sviluppato nel tempo libero. Puoi segnalare problemi qui, ma non è garantita una risoluzione immediata.

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
[Segnala un problema](https://github.com/oorzc/vscode_sync_tool/issues)

