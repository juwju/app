// GITHUB
// Connexion d'un nouvel utilisateur à GITHUB et clone du repo de bas app.
// Si c'est l'utilisateur actuel, clone le repo app, si Juwju, clone app pour production dans var/Juwju

// ADDUSER
// 1. Prise des information utilisateur             OK
// 2. Vérifier le chemin d'accès complet            OK
// 3. Configurer le fichier SSH config              OK
// 4. Cloner le dépot                               OK
// 5. Configurer les permissions                    OK
// 6. Cloner le repo app                            OK

// PULL
// ...

// PUSH
// ...

import { join } from "https://deno.land/std/path/mod.ts";
import { exists } from "https://deno.land/std/fs/mod.ts";

// Fonction pour déterminer le répertoire home de manière cross-platform
function getUserHome(username: string): string {
  let userHome = Deno.env.get("HOME");
  
  if (!userHome) {
    // Pour Windows
    const homeDrive = Deno.env.get("HOMEDRIVE") || "";
    const homePath = Deno.env.get("HOMEPATH") || "";
    userHome = homeDrive && homePath ? join(homeDrive, homePath) : "";
  }
  
  if (!userHome) {
    // Fallback si non défini
    userHome = Deno.build.os === "windows" ? `C:\\Users\\${username}` : `/home/${username}`;
    console.warn(`Variable HOME non trouvée, utilisation de '${userHome}' comme répertoire home.`);
  }
  
  return userHome;
}

// Fonction pour exécuter des commandes système
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

    return (outText + (errText ? "\n" + errText : "")).trim();
  } catch (error) {
    console.error(`Erreur lors de l'exécution de la commande : ${cmd.join(" ")}`, error);
    return null;
  }
}

// Fonction pour demander des informations à l'utilisateur
async function ask(question: string): Promise<string> {
  console.log(question);
  const decoder = new TextDecoder("utf-8");
  const buffer = new Uint8Array(1024);
  const n = await Deno.stdin.read(buffer);
  return decoder.decode(buffer.subarray(0, n)).trim();
}

// Fonction pour valider et configurer Git
async function validateGitConfig() {
  const currentEmail = await runCommand(["git", "config", "--get", "user.email"]);
  const currentName = await runCommand(["git", "config", "--get", "user.name"]);

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

  const emailPrompt = currentEmail
    ? `Entrez votre email (appuyez sur Entrée si "${currentEmail}" est correct) :`
    : "Entrez votre email pour configurer Git :";
  const emailInput = await ask(emailPrompt);
  const email = emailInput || currentEmail;

  if (email) {
    await runCommand(["git", "config", "--global", "user.email", email]);
    console.log(`Email Git configuré : ${email}`);
  }

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

// Fonction pour assurer la configuration SSH
async function ensureSSHDir(hostAlias: string, identityFile: string, username: string) {
  const userHome = getUserHome(username);
  const sshDir = join(userHome, ".ssh");
  const configPath = join(sshDir, "config");

  // Créer le répertoire .ssh
  try {
    await Deno.mkdir(sshDir, { recursive: true });
    console.log(`Répertoire .ssh créé ou déjà existant : ${sshDir}`);
  } catch (e) {
    console.error(`Échec de la création du répertoire .ssh :`, e);
  }

  // Définir les permissions sur les systèmes non-Windows
  if (Deno.build.os !== "windows") {
    try {
      await Deno.chmod(sshDir, 0o700);
      await Deno.chmod(configPath, 0o600);
    } catch (e) {
      console.warn("Impossible de définir les permissions sur .ssh : ", e);
    }
  }

  // Lire la configuration existante pour éviter les doublons
  let existingConfig = "";
  try {
    existingConfig = await Deno.readTextFile(configPath);
  } catch { /* Fichier n'existe pas */ }

  // Préparer la nouvelle configuration Host
  const newHostConfig = `Host ${hostAlias}
HostName github.com
User git
IdentityFile ${identityFile}
IdentitiesOnly yes
`;

  if (!existingConfig.includes(`Host ${hostAlias}`)) {
    try {
      await Deno.writeTextFile(configPath, existingConfig + newHostConfig, { append: true });
      console.log(`Configuration SSH ajoutée pour l'utilisateur : ${username}`);
    } catch (e) {
      console.error(`Erreur lors de l'écriture dans ${configPath} :`, e);
    }
  } else {
    console.log(`Configuration SSH déjà présente pour l'utilisateur : ${username}`);
  }
}

// Fonction pour configurer le dépôt Git de l'utilisateur
async function configureUserRepo(username: string) {
  // Initialiser la configuration SSH pour l'utilisateur
  const userHome = getUserHome(username);
  const identityFile = join(userHome, ".ssh", "id_ed25519");
  await ensureSSHDir(`github-${username}`, identityFile, username);

  // Définir le chemin du dépôt dans userHome/Juwju/app
  const repoPath = join(userHome, "Juwju", "app");

  // Créer le répertoire du dépôt s'il n'existe pas encore
  try {
    await Deno.mkdir(repoPath, { recursive: true });
    console.log(`Répertoire du dépôt créé ou déjà existant : ${repoPath}`);
  } catch (e) {
    console.error(`Échec de la création du répertoire ${repoPath} :`, e);
  }

  // Cloner le dépôt s'il n'est pas initialisé
  if (!(await exists(join(repoPath, ".git")))) {
    console.log(`Clonage du dépôt dans ${repoPath}...`);
    const cloneResult = await runCommand([
      "git",
      "clone",
      "git@github.com:webmaster-juwju/app.git",
      repoPath
    ]);
    if (cloneResult === null) {
      console.error("Échec du clonage du dépôt.");
      return;
    }
  } else {
    console.log(`Le dépôt est déjà cloné dans ${repoPath}.`);
  }

  // Retirer la configuration SSH globale existante
  await runCommand(["git", "config", "--global", "--unset", "core.sshCommand"]);

  // Définir la configuration Git locale pour le dépôt
  await runCommand([
    "git",
    "-C",
    repoPath,
    "config",
    "core.sshCommand",
    `ssh -F ${join(userHome, ".ssh", "config")}`
  ]);

  console.log("Configuration globale supprimée et configuration locale pour l'utilisateur appliquée.");
}

async function configureJuwjuRepo() {
  const username = "juwju";

  // Déterminer le répertoire home de l'utilisateur juwju et initialiser la configuration SSH
  const userHome = getUserHome(username);
  const identityFile = join(userHome, ".ssh", "id_ed25519");
  await ensureSSHDir(`github-${username}`, identityFile, username);

  // Définir un chemin de dépôt spécifique pour juwju à la racine du disque principal
  let repoPath: string;
  if (Deno.build.os === "windows") {
    // Sur Windows, par exemple C:\JUWJU\app
    repoPath = "C:\\JUWJU\\app";
  } else {
    // Sur Linux/macOS, par exemple /JUWJU/app
    repoPath = "/JUWJU/app";
  }

  // Créer le répertoire du dépôt s'il n'existe pas encore
  try {
    await Deno.mkdir(repoPath, { recursive: true });
    console.log(`Répertoire du dépôt créé ou déjà existant : ${repoPath}`);
  } catch (e) {
    console.error(`Échec de la création du répertoire ${repoPath} :`, e);
  }

  // Cloner le dépôt s'il n'est pas initialisé
  if (!(await exists(join(repoPath, ".git")))) {
    console.log(`Clonage du dépôt dans ${repoPath}...`);
    const cloneResult = await runCommand([
      "git",
      "clone",
      "git@github.com:webmaster-juwju/app.git",
      repoPath
    ]);
    if (cloneResult === null) {
      console.error("Échec du clonage du dépôt.");
      return;
    }
  } else {
    console.log(`Le dépôt est déjà cloné dans ${repoPath}.`);
  }

  // Supprimer la configuration SSH globale existante
  await runCommand(["git", "config", "--global", "--unset", "core.sshCommand"]);

  // Définir la configuration Git locale pour le dépôt de juwju
  await runCommand([
    "git",
    "-C",
    repoPath,
    "config",
    "core.sshCommand",
    `ssh -F ${join(userHome, ".ssh", "config")}`
  ]);

  console.log("Configuration globale supprimée et configuration locale pour juwju appliquée.");
}


// Fonction pour configurer les clés SSH et autres paramètres Git
async function setupUser(username: string) {
  // Détection robuste du répertoire home
  const userHome = getUserHome(username);
  if (!userHome) {
    console.error("Impossible de déterminer le répertoire home.");
    return;
  }

  await validateGitConfig();

  const useExistingKey = (await ask("Souhaitez-vous utiliser une clé SSH existante ? (oui/non) :")).toLowerCase() === "oui";
  const sshKeyPath = join(userHome, ".ssh", "id_ed25519");

  if (!useExistingKey) {
    const email = await ask("Entrez votre adresse email pour la clé SSH :");
    console.log("Génération de la clé SSH...");
    const sshGenResult = await runCommand(["ssh-keygen", "-t", "ed25519", "-C", email, "-f", sshKeyPath, "-N", ""]);
    if (sshGenResult === null) {
      console.error("Échec de la génération de la clé SSH.");
      return;
    }
    console.log("Clé SSH générée avec succès.");
  } else {
    try {
      await Deno.stat(`${sshKeyPath}.pub`);
      console.log("Clé SSH existante trouvée.");
    } catch {
      console.error(`Erreur : La clé SSH spécifiée n'existe pas (${sshKeyPath}.pub).`);
      console.log("Veuillez vérifier le chemin ou choisir de générer une nouvelle clé en relançant le script.");
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

    const addResult = await runCommand(["ssh-add", sshKeyPath]);
    if (addResult === null) {
      console.error("Échec de l'ajout de la clé au SSH agent.");
      return;
    }
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
    console.error(`Erreur lors de la lecture de la clé publique (${sshKeyPath}.pub) :`, error);
    return;
  }

  // Vérification des permissions sur .ssh (non applicable sur Windows)
  if (Deno.build.os !== "windows") {
    try {
      await runCommand(["chmod", "700", join(userHome, ".ssh")]);
      await runCommand(["chmod", "600", sshKeyPath]);
      await runCommand(["chmod", "600", `${sshKeyPath}.pub`]);
      console.log("Permissions sur .ssh configurées correctement.");
    } catch (error) {
      console.error("Erreur lors de la configuration des permissions sur .ssh :", error);
    }
  }

  // Ajout de l'hôte GitHub aux known_hosts
  try {
    const keyScanOutput = await runCommand(["ssh-keyscan", "github.com"]);
    if (keyScanOutput) {
      const knownHostsPath = join(userHome, ".ssh", "known_hosts");
      let existingKnownHosts = "";
      try {
        existingKnownHosts = await Deno.readTextFile(knownHostsPath);
      } catch { /* Fichier n'existe pas */ }

      if (!existingKnownHosts.includes("github.com")) {
        await Deno.writeTextFile(knownHostsPath, existingKnownHosts + keyScanOutput + "\n");
        console.log("Clé d'hôte GitHub ajoutée à known_hosts.");
      } else {
        console.log("Clé d'hôte GitHub déjà présente dans known_hosts.");
      }
    }
  } catch (error) {
    console.error("Erreur lors de l'ajout de la clé d'hôte GitHub à known_hosts : ", error);
  }

  // Configuration du fichier ~/.ssh/config pour l'utilisateur
  const sshConfigPath = join(userHome, ".ssh", "config");
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
    } catch { /* Fichier n'existe pas */ }

    if (!existingConfig.includes(`Host github-${username}`)) {
      await Deno.writeTextFile(sshConfigPath, sshConfigContent, { append: true });
      console.log(`Configuration SSH ajoutée pour l'utilisateur : ${username}`);
    } else {
      console.log(`Configuration SSH déjà présente pour l'utilisateur : ${username}`);
    }
  } catch (error) {
    console.error("Erreur lors de l'écriture ou vérification du fichier SSH config :", error);
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
    console.error("Erreur lors du test de connexion à GitHub. Vérifiez votre configuration.", error);
  }
}

// Fonction pour créer un utilisateur système compatible multi-OS
async function createUser(username: string) {
  const os = Deno.build.os;
  let command: string[] | null = null;

  switch (os) {
    case "linux": {
      // Vérifier si l'utilisateur existe déjà
      const checkUserLinux = await runCommand(["id", "-u", username]);
      if (checkUserLinux === null) {
        console.log(`L'utilisateur ${username} n'existe pas. Création en cours...`);
        command = ["sudo", "useradd", "-m", "-s", "/bin/bash", username];
      } else {
        console.log(`L'utilisateur ${username} existe déjà.`);
      }
      break;
    }

    case "darwin": {
      // macOS
      const checkUserMac = await runCommand(["id", "-u", username]);
      if (checkUserMac === null) {
        console.log(`L'utilisateur ${username} n'existe pas. Création en cours...`);
        // Création basique sur macOS, des étapes supplémentaires peuvent être nécessaires
        command = [
          "sudo",
          "dscl",
          ".",
          "-create",
          `/Users/${username}`,
          "UserShell",
          "/bin/bash"
        ];
        // Ajouter d'autres attributs si nécessaire, par exemple :
        // "RealName", "UniqueID", "PrimaryGroupID", etc.
      } else {
        console.log(`L'utilisateur ${username} existe déjà.`);
      }
      break;
    }

    case "windows": {
      // Windows
      const checkUserWin = await runCommand(["net", "user", username]);
      // Vérifier si la sortie contient une indication que l'utilisateur n'existe pas.
      if (checkUserWin && checkUserWin.includes("could not be found")) {
        console.log(`L'utilisateur ${username} n'existe pas. Création en cours...`);
        // Définir un mot de passe par défaut ; à personnaliser selon les besoins.
        const password = "DefaultPassword123"; 
        command = ["net", "user", username, password, "/add"];
      } else {
        console.log(`L'utilisateur ${username} existe déjà.`);
      }
      break;
    }

    default:
      console.error("Système d'exploitation non supporté pour la création d'utilisateurs.");
      return;
  }

  if (command) {
    try {
      const cloneResult = await runCommand(command);
      if (cloneResult !== null) {
        console.log(`Utilisateur '${username}' créé avec succès.`);
      } else {
        console.error(`Échec de la création de l'utilisateur '${username}'.`);
      }
    } catch (err) {
      console.error("Erreur lors de l'exécution de la commande:", err);
    }
  }
}

async function setupUserFlow(username: string) {
  // Créer l'utilisateur système s'il n'existe pas
  await createUser(username);

  // Configurer le dépôt pour l'utilisateur
  if (username === "juwju") {
    await configureJuwjuRepo();
  } else {
    await configureUserRepo(username);
  }

  // Configurer les clés SSH et autres paramètres Git
  await setupUser(username);
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
  case "setupuser": {
    if (!username) {
      console.log("Veuillez spécifier un nom d'utilisateur pour setupuser.");
      Deno.exit(1);
    }
    await setupUserFlow(username);
    break;
  }

  default:
    console.log("Commande inconnue. Utilisez : setupuser, addapp, push, pull");
}
