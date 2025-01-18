// /opt/SERVER/400-PROG-TOOLS/404-SCRIPTS/Allow.ts
import { Table } from "https://deno.land/x/cliffy@v1.0.0-rc.3/table/mod.ts";
import * as colors from "https://deno.land/std@0.204.0/fmt/colors.ts";

// Données en constante (remplacer par une importation de fichier JSON si nécessaire)
const data = {
  "commands": [
    {
      "name": "allowdl",
      "variable": "/path/to/rep",
      "description": "Octroie tous les droits à David sur ce répertoire",
      "environnement": "Server"
    },
    {
      "name": "allowml",
      "variable": "/path/to/rep",
      "description": "Octroie tous les droits à Martin sur ce répertoire",
      "environnement": "Server"
    },
  ],
  "services": [
    "101",
    "102"
  ],
  "version": "1.0.0"
};

// Création et affichage du tableau
const table = new Table()
  .header(["Commande", "Variable", "Description", "Environnement"])
  .body(data.commands.map(cmd => [
    colors.green(cmd.name),
    colors.blue(cmd.variable),
    cmd.description,
    colors.yellow(cmd.environnement)
  ]))
  .border(true);

console.log(`\nVersion : ${colors.bold(data.version)}`);
console.log(table.toString());

// Affichage des services disponibles
console.log("\nServices disponibles :");
data.services.forEach(service => {
  console.log(colors.blue(` - ${service}`));
});

console.log(); // Ligne vide pour améliorer la lisibilité