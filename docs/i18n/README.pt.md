# Sincronização FTP/SFTP/SSH 

> Ferramenta de sincronização rápida de código

[🔥 Link de download](https://marketplace.visualstudio.com/items?itemName=oorzc.ssh-tools)

##  Supported Languages

## ✨ Funcionalidades do plugin

- [x] Suporta a configuração personalizada de múltiplos ambientes de desenvolvimento  
- [x] Suporta a sincronização de código em tempo real  
- [x] Suporta o rastreamento de alterações de código e o upload manual de código  
- [x] Suporta a construção e empacotamento automático de projetos front-end  
- [x] Suporta a compressão e upload de código (mas apenas SSH suporta a descompressão remota após o upload)  
- [x] Suporta o commit no Git durante o upload  
- [x] Suporta diretórios de upload personalizados e a exclusão de diretórios específicos do upload  
- [x] Suporta upload e download simultâneos  
- [x] Suporta pausar, retomar e parar uploads e downloads  
- [x] Suporta a comparação de arquivos locais e remotos  
- [x] Suporta a visualização de código remoto, com operações como adicionar, excluir, modificar, alterar permissões, mover código, renomear e baixar arquivos  
- [x] Suporta configurações de proxy  
- [x] Suporta o upload de arquivos ou pastas arrastando e soltando em diretórios específicos do servidor  
- [x] 👍👍👍 Suporta a criptografia de contas e senhas em arquivos de configuração para evitar vazamentos de contas do servidor 👍👍👍  

## 📖 Guia de uso

1. Configuração do plugin

    - Por padrão, são ignorados os arquivos e pastas .git, .svn, .DS_Store, Thumbs.db, .idea, node_modules, runtime e sync_config.jsonc. Outros devem ser adicionados manualmente.
    - Se houver um arquivo de configuração .gitignore, o plugin usará essa configuração por padrão para ignorar o conteúdo do upload.
      ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F2a2b4adc7305c7b1c84d796da57cfe81.png)

2. Adicionar configuração do projeto
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F0aba393b99df91a094fac6c14a2aebe1.gif)

3. Configuração do proxy. O proxy só entrará em vigor se você também configurar `proxy = true` na configuração do projeto abaixo.
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F9f00f0451dd2c558ad469178d0058713.png)

Referência de configuração do arquivo sync_config.jsonc

```jsonc
{
	// Nome do ambiente, suporta nomes personalizados
	"test": {
		// Ambiente de teste
		"type": "ftp", // (Obrigatório) Tipo de transferência, suporta ftp, sftp, ssh
		"host": "0.0.0.0", // (Obrigatório) Endereço do servidor
		"port": 22, // (Opcional) Número da porta. O padrão do ftp é 21, e o padrão do sftp e ssh é 22
		"username": "username", // (Obrigatório) Nome de usuário de login
		"password": "password", // Senha de login (escolha entre senha e caminho da chave privada)
		// "privateKeyPath": "/your_path/id_rsa", // (Configuração do sftp, ssh) Caminho da chave privada (escolha entre senha e caminho da chave privada). Recomenda-se não colocar a chave na raiz do código.
		// "secretKeyPath": "/your_path/secret_key.txt", // Caminho da chave privada de criptografia, usada para criptografar nomes de usuário e senhas. Nota: É melhor não colocar a chave no diretório do código.
		"proxy": false, // Se usar proxy, o padrão é false
		"upload_on_save": false, // Enviar automaticamente após salvar. Recomendado para desenvolvimento individual. Quando upload_on_save for true, watch, submit_git_before_upload, compress, deleteRemote serão inválidos. O padrão é false.
		"watch": false, // Monitorar alterações de arquivos no diretório de upload. O padrão é true. Se upload_on_save for true, esse item será inválido. Se a distPath estiver configurada, apenas monitorará as alterações nos arquivos do diretório distPath.
		"submit_git_before_upload": true, // Para desenvolvimento em equipe. Enviar o código local do git antes do upload para evitar substituir o código remoto. O padrão é false.
		"submit_git_msg": "", // Configuração da mensagem do commit do git. O padrão é vazio. Quando submit_git_before_upload for true e não for preenchido, aparecerá um prompt para preenchimento manual.
		// "build": "yarn build:test", // (Opcional) Comando de construção. Se for um projeto front-end, ative este item.
		"compress": true, // Se compactar o upload. O padrão é false.
		//"remote_unpacked": true, // Se descompactar remotamente após o upload compactado (requer suporte ao ssh). O padrão do ssh é true, e o padrão dos outros é false.
		//"delete_remote_compress": true, // Se excluir o arquivo compactado remoto após o upload. O padrão do ssh é true, e o padrão dos outros é false.
		//"delete_local_compress": true, // Se excluir o arquivo compactado local após o upload. O padrão é true.
		"distPath": [], // (Opcional) Diretório local a ser carregado. Suporta strings ou arrays. O padrão é o diretório raiz do upload.
		"upload_to_root": false, // Se a distPath configurada tiver apenas um diretório, carregue-o para o diretório raiz do remotePath. Geralmente usado para implantar código front-end. O padrão é false.
		"deleteRemote": false, // Se excluir o diretório remoto configurado em distPath antes do upload. Geralmente usado para limpar o código de implantação front-end. O padrão é false.
		"remotePath": "/www/wwwroot/test", // (Configuração do sftp, ssh) Endereço do servidor de upload
		"excludePath": [], // (Opcional) Arquivos e diretórios a serem excluídos do upload no ambiente atual. Será mesclado com a configuração excludePath do plugin. Quando a configuração do plugin usar o gitignore, será mesclado com o arquivo de configuração .gitignore.
		// "downloadPath": "" // (Opcional) Caminho de download. O padrão é o diretório raiz do projeto atual. Usado ao baixar arquivos ou pastas manualmente. Pode especificar o endereço de download.
		// "downloadExcludePath": [], //  (Opcional) Arquivos e diretórios a serem excluídos do download
		"default": true // Se é o ambiente padrão. Quando for true, você pode usar o menu de contexto para fazer upload rápido de arquivos ou pastas e comparar arquivos remotos. O padrão é false.
	},
	"online": {
		// Ambiente oficial
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

### Prioridade de autenticação e erros de validação

- Para `sftp` / `ssh`, a autenticação tenta primeiro `privateKeyPath`; se não estiver disponível, usa `password` como fallback.
- Para `ftp`, apenas autenticação por `password` é suportada.
- Mensagens de validação em tempo de execução:

```text
FTP only supports password authentication. Please configure [password]
The configured [privateKeyPath] does not exist, and [password] is empty. Please provide a valid private key file or password
Please configure authentication: [privateKeyPath] (preferred) or [password]
```

```js
// Regras de exclusão para excludePath e downloadExcludePath, suportam curingas
[
	"**/*.mp4",
	"aaa/bbb", // Excluir a pasta aaa/bbb
	"!aaa/bbb/ccc", // Não excluir a pasta ccc dentro de aaa/bbb
]
```

## Demonstração de upload

Demonstração de upload
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F8f85ff0142ef082749b55f7db3c8bf13.gif)

Demonstração de comparação de arquivos
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F6cbd149ae7959c8097ce288fb91ed800.gif)

##  Lembrete Amigável

1. Se você não conseguir se conectar ao servidor, pode tentar usar outras ferramentas de conexão, como xftp, filezilla, etc., para se conectar ao servidor. Uma vez confirmado, você pode tentar se conectar novamente.
2. Após enviar arquivos, se o menu de árvore não for atualizado, você pode usar o menu de contexto para atualizar a árvore de arquivos.
3. Por que o arquivo não é baixado do servidor ao reabri-lo? Para economizar recursos, o plug-in armazena em cache os arquivos abertos. Se precisar atualizar o arquivo, use o menu de contexto e atualize-o.
4. Por que o nome de usuário ou a senha não podem ser descriptografados? Sua chave foi alterada. Reinsira a senha da conta inicial e criptografe/descriptografe novamente.
5. Toda vez que você edita o arquivo de configuração, todas as tarefas são interrompidas automaticamente. Portanto, não modifique o arquivo de configuração durante o processo de upload.

## Relato de problemas

Este projeto é desenvolvido no tempo livre. Se você encontrar problemas, pode relatá - los aqui, mas não há garantia de que serão corrigidos imediatamente.

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
[Relatar problema](https://github.com/oorzc/vscode_sync_tool/issues)

