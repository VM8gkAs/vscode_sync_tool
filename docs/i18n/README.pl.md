# Synchronizacja FTP/SFTP/SSH 

> Narzędzie do szybkiej synchronizacji kodu

[🔥 Link do pobrania](https://marketplace.visualstudio.com/items?itemName=oorzc.ssh-tools)

##  Supported Languages

## ✨ Funkcje wtyczki

- [x] Obsługuje konfigurację wielu środowisk programistycznych  
- [x] Obsługuje synchronizację kodu w czasie rzeczywistym  
- [x] Obsługuje śledzenie zmian w kodzie i ręczne przesyłanie kodu  
- [x] Obsługuje automatyczne budowanie i pakowanie projektów front-endowych  
- [x] Obsługuje kompresję i przesyłanie kodu (ale tylko SSH obsługuje zdalne rozpakowanie po przesłaniu)  
- [x] Obsługuje zatwierdzanie w Git podczas przesyłania  
- [x] Obsługuje niestandardowe katalogi przesyłania i wykluczanie określonych katalogów z przesyłania  
- [x] Obsługuje równoczesne przesyłanie i pobieranie  
- [x] Obsługuje wstrzymywanie, wznawianie i zatrzymywanie przesyłania i pobierania  
- [x] Obsługuje porównywanie plików lokalnych i zdalnych  
- [x] Obsługuje przeglądanie zdalnego kodu z operacjami takimi jak dodawanie, usuwanie, modyfikowanie, zmiana uprawnień, przenoszenie kodu, zmiana nazwy i pobieranie plików  
- [x] Obsługuje ustawienia proxy  
- [x] Obsługuje przeciąganie i upuszczanie plików lub folderów do określonych katalogów na serwerze  
- [x] 👍👍👍 Obsługuje szyfrowanie kont i haseł w plikach konfiguracyjnych, aby zapobiec wyciekom kont serwera 👍👍👍  

## 📖 Instrukcja użycia

1. Konfiguracja wtyczki

    - Domyślnie ignorowane są pliki i foldery .git, .svn, .DS_Store, Thumbs.db, .idea, node_modules, runtime, sync_config.jsonc. Pozostałe należy dodać ręcznie.
    - Jeśli istnieje plik konfiguracyjny .gitignore, domyślnie używany jest ten plik do ignorowania zawartości przesyłania.
      ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F2a2b4adc7305c7b1c84d796da57cfe81.png)

2. Dodawanie konfiguracji projektu
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F0aba393b99df91a094fac6c14a2aebe1.gif)

3. Ustawianie serwera proxy, które zaczyna obowiązywać tylko wtedy, gdy w konfiguracji projektu ustawisz `proxy = true`.
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F9f00f0451dd2c558ad469178d0058713.png)

Przykład konfiguracji pliku `sync_config.jsonc`

```jsonc
{
	// Nazwa środowiska, można ustawić dowolną nazwę
	"test": {
		// Środowisko testowe
		"type": "ftp", // (Wymagane) Typ transferu, obsługuje ftp, sftp, ssh
		"host": "0.0.0.0", // (Wymagane) Adres serwera
		"port": 22, // (Opcjonalne) Numer portu, domyślnie 21 dla ftp, 22 dla sftp i ssh
		"username": "username", // (Wymagane) Nazwa użytkownika do logowania
		"password": "password", // Hasło do logowania (wybierz jedno z hasła lub ścieżki do klucza prywatnego)
		// "privateKeyPath": "/your_path/id_rsa", // (Konfiguracja dla sftp, ssh) Ścieżka do klucza prywatnego (wybierz jedno z hasła lub ścieżki do klucza prywatnego), uwaga: najlepiej nie umieszczać klucza w katalogu głównym kodu
		// "secretKeyPath": "/your_path/secret_key.txt", // Ścieżka do prywatnego klucza szyfrowania, używana do szyfrowania nazw użytkowników i haseł. Uwaga: Najlepiej nie umieszczać klucza w katalogu kodu.
		"proxy": false, // Czy używać serwera proxy, domyślnie false
		"upload_on_save": false, // Natychmiastowe przesyłanie po zapisaniu, zalecane dla pojedynczego dewelopera. Gdy `upload_on_save` jest ustawione na true, opcje `watch`, `submit_git_before_upload`, `compress`, `deleteRemote` są nieaktualne, domyślnie false
		"watch": false, // Monitorowanie zmian w plikach w katalogu przesyłania, domyślnie true. Jeśli `upload_on_save` jest ustawione na true, ta opcja jest nieaktualna. Jeśli skonfigurowano katalog `distPath`, monitorowane są tylko zmiany w plikach w tym katalogu.
		"submit_git_before_upload": true, // Do użycia w zespołach, przesyłanie kodu lokalnego do gita przed przesłaniem na serwer, aby zapobiec nadpisaniu zdalnego kodu, domyślnie false
		"submit_git_msg": "", // Komunikat do commitu git, domyślnie pusty. Gdy `submit_git_before_upload` jest ustawione na true i pole jest puste, pojawi się okno dialogowe do ręcznego wprowadzenia komunikatu.
		// "build": "yarn build:test", // (Opcjonalne) Komenda do budowania projektu, należy włączyć dla projektów front-endowych
		"compress": true, // Czy kompresować przed przesłaniem, domyślnie false
		//"remote_unpacked": true, // Czy rozpakować plik na serwerze po przesłaniu (wymaga obsługi ssh), domyślnie true dla ssh, false dla innych
		//"delete_remote_compress": true, // Czy usunąć zdalny plik skompresowany po przesłaniu, domyślnie true dla ssh, false dla innych
		//"delete_local_compress": true, // Czy usunąć lokalny plik skompresowany po przesłaniu, domyślnie true
		"distPath": [], // (Opcjonalne) Lokalny katalog do przesłania, obsługuje łańcuch znaków lub tablicę, domyślnie przesyłany jest katalog główny
		"upload_to_root": false, // Jeśli w `distPath` skonfigurowano tylko jeden katalog, przesyłaj go do katalogu głównego `remotePath`, zazwyczaj używane do wdrażania projektów front-endowych, domyślnie false
		"deleteRemote": false, // Czy usunąć zdalny katalog skonfigurowany w `distPath` przed przesłaniem, zazwyczaj używane do czyszczenia wdrożonego kodu front-endowego, domyślnie false
		"remotePath": "/www/wwwroot/test", // (Konfiguracja dla sftp, ssh) Katalog docelowy na serwerze
		"excludePath": [], // (Opcjonalne) Pliki i katalogi do wykluczenia z przesyłania w tym środowisku, będą połączone z globalną konfiguracją `excludePath` wtyczki. Gdy wtyczka używa `.gitignore`, będą połączone z tym plikiem.
		// "downloadPath": "" // (Opcjonalne) Katalog docelowy dla pobierania, domyślnie katalog główny projektu, używane przy ręcznym pobieraniu plików lub folderów, można określić inny katalog.
		// "downloadExcludePath": [], //  (Opcjonalne) Pliki i katalogi do wykluczenia z pobierania
		"default": true // Czy to jest domyślne środowisko. Gdy ustawione na true, można użyć menu kontekstowego do szybkiego przesyłania plików lub folderów oraz porównywania z plikami zdalnymi, domyślnie false
	},
	"online": {
		// Środowisko produkcyjne
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

### Priorytet uwierzytelniania i błędy walidacji

- Dla `sftp` / `ssh` najpierw używany jest `privateKeyPath`; jeśli jest niedostępny, następuje fallback do `password`.
- Dla `ftp` obsługiwane jest tylko uwierzytelnianie `password`.
- Komunikaty walidacji w czasie działania:

```text
FTP only supports password authentication. Please configure [password]
The configured [privateKeyPath] does not exist, and [password] is empty. Please provide a valid private key file or password
Please configure authentication: [privateKeyPath] (preferred) or [password]
```

```js
// Reguły wykluczania dla `excludePath` i `downloadExcludePath`, obsługują symbol wieloznaczny
[
	"**/*.mp4",
	"aaa/bbb", // Wyklucz aaa/bbb
	"!aaa/bbb/ccc", // Nie wykluczaj folderu ccc w aaa/bbb
]
```

## Demonstracja przesyłania

Demonstracja przesyłania
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F8f85ff0142ef082749b55f7db3c8bf13.gif)

Demonstracja porównywania plików
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F6cbd149ae7959c8097ce288fb91ed800.gif)

## Przyjazne Przypomnienie

1. Jeśli nie możesz połączyć się z serwerem, możesz spróbować użyć innych narzędzi do połączenia, takich jak xftp, filezilla itp., aby połączyć się z serwerem. Po potwierdzeniu możesz spróbować ponownie się połączyć.
2. Po przesłaniu plików, jeśli menu drzewa nie zostanie zaktualizowane, możesz użyć menu kontekstowego, aby odświeżyć drzewo plików.
3. Dlaczego plik nie jest pobierany z serwera po ponownym otwarciu? Aby zaoszczędzić zasoby, wtyczka buforuje otwarte pliki. Jeśli chcesz zaktualizować plik, użyj menu kontekstowego i odśwież go.
4. Dlaczego nie można odszyfrować nazwy użytkownika lub hasła? Twój klucz został zmodyfikowany. Wprowadź ponownie początkowe hasło konta i zaszyfruj/odszyfruj je ponownie.
5. Za każdym razem, gdy edytujesz plik konfiguracyjny, wszystkie zadania są automatycznie zatrzymywane. Dlatego nie modyfikuj pliku konfiguracyjnego podczas przesyłania.

## Zgłaszanie problemów

Ten projekt jest tworzony w czasie wolnym. Jeśli napotkasz problem, możesz go zgłosić pod tym linkiem, ale nie gwarantujemy natychmiastowego rozwiązania.

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
[Zgłoś problem](https://github.com/oorzc/vscode_sync_tool/issues)

