import { exec } from "https://deno.land/x/exec/mod.ts";
import { readLines } from "https://deno.land/std/io/mod.ts";


// Connexion d'un nouvel utilisateur à GITHUB et clone du repo de bas app.
// Si c'est l'utilisateur actuel, clone le repo app, si Juwju, clone app pour production dans var/Juwju

// 1. Prise des information utilisateur             Note seulement, Non testé
// 2. Vérifier le chemin d'accès complet            Note seulement, Non testé
// 3. Configurer le fichier SSH config              Note seulement, Non testé
// 4. Cloner le dépot                               Note seulement, Non testé
// 5. Configurer les permissions                    Note seulement, Non testé
// 6. Cloner le repo app                            Note seulement, Non testé



async function ask(question) {
  console.log(question);
  const decoder = new TextDecoder("utf-8");
  const buffer = new Uint8Array(1024);
  const n = await Deno.stdin.read(buffer);
  return decoder.decode(buffer.subarray(0, n)).trim();
}

async function setup() {
  // Demander le nom d'utilisateur
  const username = await ask("Entrez votre nom d'utilisateur système :");

  // Demander si une clé existante doit être utilisée
  const useExistingKey = (await ask("Souhaitez-vous utiliser une clé SSH existante ? (oui/non) :")).toLowerCase() === "oui";

  if (!useExistingKey) {
    // Générer une nouvelle clé SSH
    const email = await ask("Entrez votre adresse email pour la clé SSH :");
    console.log("Génération de la clé SSH...");
    await exec(`ssh-keygen -t ed25519 -C "${email}" -f ~/.ssh/id_ed25519 -N ""`);
    console.log("Clé SSH générée avec succès.");
  }

  // Ajouter la clé au SSH agent
  console.log("Ajout de la clé au SSH agent...");
  await exec(`eval \"$(ssh-agent -s)\" && ssh-add ~/.ssh/id_ed25519`);

  // Afficher la clé publique
  console.log("Voici votre clé publique :\n");
  const pubKey = await Deno.readTextFile("~/.ssh/id_ed25519.pub");
  console.log(pubKey);

  console.log(
    "Ajoutez cette clé à GitHub via https://github.com/settings/ssh/new\n"
  );

  const proceed = (await ask("Appuyez sur Entrée une fois la clé ajoutée à GitHub.")) || "";

  // Vérifier si la connexion SSH fonctionne
  console.log("Test de connexion à GitHub...");
  const testSSH = await exec("ssh -T git@github.com");
  console.log(testSSH.output);

  // Définir le chemin de destination
  const destination = username === "juwju" ? "/var/JUWJU/app" : `/home/${username}/JUWJU/app`;

  // Créer le répertoire si nécessaire
  await exec(`mkdir -p ${destination}`);

  // Cloner le dépôt
  console.log("Clonage du dépôt...");
  const repo = await ask("Entrez l'URL SSH du dépôt GitHub (ex: git@github.com:user/repo.git) :");
  await exec(`git clone ${repo} ${destination}`);

  // Appliquer les permissions si nécessaire
  if (username === "juwju") {
    console.log("Application des permissions...");
    await exec(`sudo chown -R juwju:juwju ${destination}`);
  }

  console.log("Le dépôt a été cloné avec succès dans :", destination);
}

await setup();