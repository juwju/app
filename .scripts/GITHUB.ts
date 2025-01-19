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
  
      const { stdout } = await process.output();
      return new TextDecoder().decode(stdout).trim();
    } catch (error) {
      console.error(`Erreur lors de l'exécution de la commande : ${cmd.join(" ")}`, error);
      return null; // Retourne null si la commande échoue
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
      // Vérifie si la clé existe
      try {
        await Deno.stat(`${sshKeyPath}.pub`);
        console.log("Clé SSH existante trouvée.");
      } catch {
        console.error(`Erreur : La clé SSH spécifiée n'existe pas (${sshKeyPath}.pub).`);
        console.log(
          "Veuillez vérifier le chemin ou choisir de générer une nouvelle clé en relançant le script.",
        );
        return;
      }
    }
  
    console.log("Ajout de la clé au SSH agent...");
    try {
      // Démarrer le SSH agent
      await runCommand(["ssh-agent", "-s"]);
  
      // Ajouter la clé au SSH agent
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
    } catch (error) {
      console.error(
        `Erreur lors de la lecture de la clé publique (${sshKeyPath}.pub) :`,
        error,
      );
      return;
    }
  
    console.log("Ajoutez cette clé à GitHub via https://github.com/settings/ssh/new\n");
  
    // Configurer le fichier SSH
    const sshConfigPath = `${Deno.env.get("HOME")}/.ssh/config`;
    const sshConfigContent = `
  Host github-${username}
      HostName github.com
      User git
      IdentityFile ${sshKeyPath}
      IdentitiesOnly yes
  `;
  
    try {
      await Deno.writeTextFile(sshConfigPath, sshConfigContent, { append: true });
      console.log(`Configuration SSH ajoutée pour l'utilisateur : ${username}`);
      
      // Forcer Git à utiliser cette configuration
      await runCommand([
        "git",
        "config",
        "--global",
        "core.sshCommand",
        `ssh -F ${sshConfigPath} github-${username}`,
      ]);
      
      console.log("Configuration Git mise à jour pour utiliser cette clé.");
      
    } catch (error) {
      console.error("Erreur lors de l'écriture du fichier SSH config :", error);
      return;
    }
  
    await ask("Appuyez sur Entrée une fois la clé ajoutée à GitHub.");
  
    console.log("Test de connexion à GitHub...");
    try {
        console.log(`Validation de la connexion avec la clé configurée ${sshKeyPath}...`);
        const testSSH = await runCommand(["ssh", "-i", sshKeyPath, "-T", "git@github.com"]);
        console.log(`Retour du test : ${testSSH}`);
        if (testSSH?.includes("successfully authenticated")) {
        console.log("Connexion réussie avec la clé configurée !");
        } else {
        console.error("Test échoué : La connexion SSH n'a pas été authentifiée.");
        console.error(testSSH || "Aucune sortie détectée.");
        }
      
      console.log(testSSH);
      
  } catch(error){
      console.error(
      "Test Échoué! Vérifiez que clef publique est bien lié"
  )}
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
      await setupUser(username);
      break;
  
    default:
      console.log("Commande inconnue. Utilisez : setupuser, addapp, push, pull");
  }
  