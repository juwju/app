// GITHUB
// Connexion d'un nouvel utilisateur à GITHUB et clone du repo de bas app.
// Si c'est l'utilisateur actuel, clone le repo app, si Juwju, clone app pour production dans var/Juwju

// ADDUSER
// 1. Prise des information utilisateur             Note seulement, Non testé
// 2. Vérifier le chemin d'accès complet            Note seulement, Non testé
// 3. Configurer le fichier SSH config              Note seulement, Non testé
// 4. Cloner le dépot                               Note seulement, Non testé
// 5. Configurer les permissions                    Note seulement, Non testé
// 6. Cloner le repo app                            Note seulement, Non testé

// PULL
// ...

// PUSH
// ...

async function runCommand(cmd: string[]): Promise<string | null> {
    try {
      const process = new Deno.Command(cmd[0], {
        args: cmd.slice(1),
        stdout: "piped",
        stderr: "piped",
      }).spawn();
  
      const { stdout, stderr } = await process.output();
      const outText = new TextDecoder().decode(stdout).trim();
      const errText = new TextDecoder().decode(stderr).trim();
  
      // On retourne la concaténation des deux
      return (outText + (errText ? "\n" + errText : "")).trim();
    } catch (error) {
      console.error(`Erreur lors de l'exécution de la commande : ${cmd.join(" ")}`, error);
      return null;
    }
  }
  
  
  async function ask(question: string): Promise<string> {
    console.log(question);
    const decoder = new TextDecoder("utf-8");
    const buffer = new Uint8Array(1024);
    const n = await Deno.stdin.read(buffer);
    return decoder.decode(buffer.subarray(0, n)).trim();
  }
  
  async function validateGitConfig() {
    // Récupérer les valeurs actuelles
    const currentEmail = await runCommand(["git", "config", "--get", "user.email"]);
    const currentName = await runCommand(["git", "config", "--get", "user.name"]);
  
    // Afficher les valeurs actuelles si elles existent
    if (currentEmail) {
      console.log(`Email actuel trouvé : ${currentEmail}`);
    } else {
      console.log("Aucun email Git configuré.");
    }
  
    if (currentName) {
      console.log(`Nom actuel trouvé : ${currentName}`);
    } else {
      console.log("Aucun nom Git configuré.");
    }
  
    // Demander l'email avec une valeur par défaut
    const emailPrompt = currentEmail
      ? `Entrez votre email (appuyez sur Entrée si "${currentEmail}" est correct) :`
      : "Entrez votre email pour configurer Git :";
    const emailInput = await ask(emailPrompt);
    const email = emailInput || currentEmail;
  
    if (email) {
      await runCommand(["git", "config", "--global", "user.email", email]);
      console.log(`Email Git configuré : ${email}`);
    }
  
    // Demander le nom avec une valeur par défaut
    const namePrompt = currentName
      ? `Entrez votre nom (appuyez sur Entrée si "${currentName}" est correct) :`
      : "Entrez votre nom pour configurer Git :";
    const nameInput = await ask(namePrompt);
    const name = nameInput || currentName;
  
    if (name) {
      await runCommand(["git", "config", "--global", "user.name", name]);
      console.log(`Nom Git configuré : ${name}`);
    }
  }
  
  async function setupUser(username: string) {
    await validateGitConfig();
  
    const useExistingKey =
      (await ask("Souhaitez-vous utiliser une clé SSH existante ? (oui/non) :")).toLowerCase() === "oui";
    const sshKeyPath = `${Deno.env.get("HOME")}/.ssh/id_ed25519`;
  
    if (!useExistingKey) {
      const email = await ask("Entrez votre adresse email pour la clé SSH :");
      console.log("Génération de la clé SSH...");
      await runCommand(["ssh-keygen", "-t", "ed25519", "-C", email, "-f", sshKeyPath, "-N", ""]);
      console.log("Clé SSH générée avec succès.");
    } else {
      try {
        await Deno.stat(`${sshKeyPath}.pub`);
        console.log("Clé SSH existante trouvée.");
      } catch {
        console.error(`Erreur : La clé SSH spécifiée n'existe pas (${sshKeyPath}.pub).`);
        console.log(
          "Veuillez vérifier le chemin ou choisir de générer une nouvelle clé en relançant le script."
        );
        return;
      }
    }
  
    console.log("Ajout de la clé au SSH agent...");
    try {
      const agentOutput = await runCommand(["ssh-agent", "-s"]);
      if (agentOutput) {
        const lines = agentOutput.split("\n");
        for (const line of lines) {
          const match = /(\S+)=(\S+);/.exec(line);
          if (match) {
            Deno.env.set(match[1], match[2]);
          }
        }
      }
      console.log("SSH agent démarré.");
  
      await runCommand(["ssh-add", sshKeyPath]);
      console.log("Clé ajoutée au SSH agent avec succès.");
    } catch (error) {
      console.error("Erreur lors de l'ajout de la clé au SSH agent :", error);
      return;
    }
  
    console.log("Voici votre clé publique :");
    try {
      const pubKey = await Deno.readTextFile(`${sshKeyPath}.pub`);
      console.log(pubKey);
      console.log("Ajoutez cette clé à GitHub via https://github.com/settings/ssh/new\n");
    } catch (error) {
      console.error(
        `Erreur lors de la lecture de la clé publique (${sshKeyPath}.pub) :`,
        error
      );
      return;
    }
  
    // Vérification des permissions sur .ssh
    try {
      await runCommand(["chmod", "700", `${Deno.env.get("HOME")}/.ssh`]);
      await runCommand(["chmod", "600", sshKeyPath]);
      await runCommand(["chmod", "600", `${sshKeyPath}.pub`]);
      console.log("Permissions sur .ssh configurées correctement.");
    } catch (error) {
      console.error("Erreur lors de la configuration des permissions sur .ssh :", error);
    }
  
    // Ajout de l'hôte GitHub aux known_hosts
    try {
      await runCommand(["ssh-keyscan", "github.com", ">>", `${Deno.env.get("HOME")}/.ssh/known_hosts`]);
      console.log("Clé d'hôte GitHub ajoutée à known_hosts.");
    } catch (error) {
      console.error(
        "Erreur lors de l'ajout de la clé d'hôte GitHub à known_hosts :",
        error
      );
    }
  
    // Configuration du fichier ~/.ssh/config
    const sshConfigPath = `${Deno.env.get("HOME")}/.ssh/config`;
    const sshConfigContent = `
  Host github-${username}
      HostName github.com
      User git
      IdentityFile ${sshKeyPath}
      IdentitiesOnly yes
  `;
  
    try {
      let existingConfig = "";
      try {
        existingConfig = await Deno.readTextFile(sshConfigPath);
      } catch {} // Ignorer si le fichier n'existe pas
  
      if (!existingConfig.includes(`Host github-${username}`)) {
        await Deno.writeTextFile(sshConfigPath, sshConfigContent, { append: true });
        console.log(`Configuration SSH ajoutée pour l'utilisateur : ${username}`);
      } else {
        console.log(`Configuration SSH déjà présente pour l'utilisateur : ${username}`);
      }
    } catch (error) {
      console.error(
        "Erreur lors de l'écriture ou vérification du fichier SSH config :",
        error
      );
    }
  
    // Test de connexion à GitHub en mode debug
    console.log("Test de connexion à GitHub...");
    try {
      const testSSH = await runCommand([
        "ssh",
        "-v",
        "-F",
        sshConfigPath,
        "-T",
        `github-${username}`,
      ]);
      if (testSSH?.includes("successfully authenticated")) {
        console.log("Connexion réussie !");
      } else {
        console.error("Test échoué :", testSSH || "Aucune sortie détectée.");
      }
    } catch (error) {
      console.error(
        "Erreur lors du test de connexion à GitHub. Vérifiez votre configuration.",
        error
      );
    }
  }
  
  async function configureJuwjuRepo() {
    const userHome = Deno.env.get("HOME");
    if (!userHome) {
      console.error("Impossible de déterminer le répertoire home.");
      return;
    }
  
    // Utilisation de la fonction générique pour initialiser ~/.ssh/config
    await ensureSSHDir("github-juwju", `${userHome}/.ssh/id_ed25519`);
  
    // 1. Retirer core.sshCommand global
    await Deno.run({ cmd: ["git", "config", "--global", "--unset", "core.sshCommand"] }).status();
  
    // 2. Définir le core.sshCommand local pour le répertoire /var/JUWJU/app
    const repoPath = "/var/JUWJU/app";
    await Deno.run({
      cmd: [
        "git",
        "-C",
        repoPath,
        "config",
        "core.sshCommand",
        `ssh -F ${userHome}/.ssh/config`
      ],
    }).status();
      
    console.log("Configuration globale supprimée et config locale pour juwju appliquée.");
  }
  
  
  
  async function ensureSSHDir(
    hostAlias: string,
    identityFile: string
  ) {
    const home = Deno.env.get("HOME");
    if (!home) {
      console.error("Impossible de déterminer le répertoire home.");
      return;
    }
    const basePath = home;
    const configContent = `Host github.com
      HostName github.com
      User git
      IdentityFile ${identityFile}
      IdentitiesOnly yes`;
  
    // Création et configuration du répertoire .ssh
    await runCommand(["mkdir", "-p", `${basePath}/.ssh`]);
    await runCommand(["chmod", "700", `${basePath}/.ssh`]);
    await runCommand(["touch", `${basePath}/.ssh/config`]);
    await runCommand(["chmod", "600", `${basePath}/.ssh/config`]);
    
    // Ajout du contenu de configuration
    await runCommand([
      "bash",
      "-c",
      `echo '${configContent}' >> ${basePath}/.ssh/config`
    ]);
  
    // Changer le propriétaire sur le dossier .ssh vers l'utilisateur courant
    const currentUser = Deno.env.get("USER") || "";
    await runCommand([
      "chown",
      "-R",
      `${currentUser}:${currentUser}`,
      `${basePath}/.ssh`
    ]);
  
    console.log(`${basePath}/.ssh/config initialisé.`);
  }
  
  



  // Lecture des arguments passés via la ligne de commande
  const args = Deno.args;
  const command = args[0];
  const username = args[1];
  
  if (!command) {
    console.log("Veuillez spécifier une commande : setupuser, addapp, push, pull");
    Deno.exit(1);
  }
  
  switch (command) {
    case "setupuser":
      if (!username) {
        console.log("Veuillez spécifier un nom d'utilisateur pour setupuser.");
        Deno.exit(1);
      }
      if (username === "juwju") {
        await configureJuwjuRepo();
      }
      await setupUser(username);
      break;
  
    default:
      console.log("Commande inconnue. Utilisez : setupuser, addapp, push, pull");
  }
  
  