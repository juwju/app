import { Table } from "https://deno.land/x/cliffy@v1.0.0-rc.3/table/mod.ts";
import * as colors from "https://deno.land/std@0.200.0/fmt/colors.ts";

// Données des catégories de commandes extraites de deno.json
const categories = {
  "DOCKER-COMPOSE": [
    { name: "up", description: "Lancer Docker Compose en mode détaché" },
    { name: "uplog", description: "Lancer Docker Compose avec logs" },
    { name: "upbuild", description: "Lancer Docker Compose avec rebuild des images" },
    { name: "down", description: "Arrêter Docker Compose en mode détaché" },
    { name: "downlog", description: "Arrêter Docker Compose avec logs" },
    { name: "restart", description: "Redémarrer Docker Compose" },
  ],
  "DOCKER SWARM": [
    { name: "deploy", description: "Déployer avec Docker Swarm" },
    { name: "stop", description: "Arrêter Docker Swarm" },
  ],
  "APP": [
    { name: "cloneftd", description: "Cloner une application FTD" },
    { name: "update", description: "Mettre à jour l'application" },
    { name: "diagsrv", description: "Diagnostiquer le serveur" },
    { name: "cvtvol", description: "Convertir les volumes Docker" },
    { name: "installapp", description: "Installer une application" },
  ],
  "GITHUB": [
    { name: "setupuser", description: "Configurer un utilisateur GitHub" },
    { name: "addapp", description: "Ajouter une application GitHub" },
    { name: "push", description: "Envoyer des changements sur GitHub" },
    { name: "pull", description: "Récupérer des changements depuis GitHub" },
  ],
};

// Fonction pour afficher les commandes d'une catégorie
function displayCategory(categoryName: string) {
  const category = categories[categoryName];
  if (!category) {
    console.log(colors.red(`Erreur : Catégorie non trouvée : ${categoryName}`));
    return;
  }

  const table = new Table()
    .header([colors.bold("Commande"), colors.bold("Description")])
    .body(category.map((cmd) => [colors.green(cmd.name), cmd.description]))
    .border(true);

  console.log(colors.yellow(`\nCommandes pour la catégorie : ${categoryName}\n`));
  console.log(table.toString());
}

// Fonction principale
function main() {
  const args = Deno.args;
  if (args.length === 0) {
    console.log(colors.yellow("Utilisation : deno run --allow-read script.ts <catégorie>"));
    console.log(colors.green("\nCatégories disponibles :"));
    Object.keys(categories).forEach((cat) => console.log(`- ${colors.blue(cat)}`));
    return;
  }

  const categoryName = args[0].toUpperCase();
  displayCategory(categoryName);
}

main();

