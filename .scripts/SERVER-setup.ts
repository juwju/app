// Importation des modules nécessaires
import { exec } from "https://deno.land/x/exec/mod.ts";
import { ensureFile } from "https://deno.land/std/fs/mod.ts";
import { writeTextFile } from "https://deno.land/std/fs/mod.ts";

// Fonction pour exécuter une commande shell
async function runCommand(command: string) {
  console.log(`Exécution : ${command}`);
  const result = await exec(command);
  if (result.status.code !== 0) {
    console.error(`Erreur : ${result.stderr}`);
    Deno.exit(result.status.code);
  }
  console.log(result.stdout);
}

// Fonction pour installer Docker
async function installDocker() {
  console.log("Installation de Docker...");
  await runCommand("sudo apt update");
  await runCommand("sudo apt install -y docker.io");
  await runCommand("sudo systemctl enable docker");
  await runCommand("sudo systemctl start docker");
}

// Fonction pour installer WireGuard
async function installWireGuard() {
  console.log("Installation de WireGuard...");
  await runCommand("sudo apt install -y wireguard");
}

// Fonction pour configurer WireGuard
async function configureWireGuard(serverType: "manager" | "worker", managerIp?: string) {
  console.log(`Configuration de WireGuard pour ${serverType}...`);

  // Génération des clés privées et publiques
  const privateKey = (await exec("wg genkey")).stdout.trim();
  const publicKey = (await exec(`echo "${privateKey}" | wg pubkey`)).stdout.trim();

  // Chemin du fichier de configuration WireGuard
  const wgConfigPath = "/etc/wireguard/wg0.conf";

  // Configuration spécifique au manager ou au worker
  let wgConfig = "";
  if (serverType === "manager") {
    wgConfig = `
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = ${privateKey}

# Exemple d'un peer worker (à compléter avec les clés des workers)
#[Peer]
#PublicKey = <clé_publique_du_worker>
#AllowedIPs = 10.0.0.2/32
    `;
    console.log(`Clé publique du manager : ${publicKey}`);
    console.log("Ajoutez cette clé publique dans la configuration des workers.");
  } else if (serverType === "worker" && managerIp) {
    wgConfig = `
[Interface]
Address = 10.0.0.X/24 # Remplacez X par un numéro unique pour chaque worker
PrivateKey = ${privateKey}

[Peer]
PublicKey = <clé_publique_du_manager> # Remplacez par la clé publique du manager
Endpoint = ${managerIp}:51820
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
    `;
    console.log(`Clé publique du worker : ${publicKey}`);
    console.log("Ajoutez cette clé publique dans la configuration du manager.");
  } else {
    throw new Error("La configuration du worker nécessite l'IP du manager.");
  }

  // Écriture de la configuration dans le fichier WireGuard
  await ensureFile(wgConfigPath);
  await writeTextFile(wgConfigPath, wgConfig);

  // Activation et démarrage de WireGuard
  await runCommand(`sudo systemctl enable wg-quick@wg0`);
  await runCommand(`sudo systemctl start wg-quick@wg0`);
}

// Fonction pour initialiser Docker Swarm sur le manager
async function initializeDockerSwarm() {
  console.log("Initialisation de Docker Swarm...");
  
  // Récupérer l'adresse IP locale (WireGuard)
  const ipResult = await exec("hostname -I | awk '{print $1}'");
  const advertiseAddr = ipResult.stdout.trim();

  // Initialisation de Swarm avec l'adresse IP WireGuard
  await runCommand(`sudo docker swarm init --advertise-addr ${advertiseAddr}`);
}

// Fonction pour rejoindre un cluster Docker Swarm en tant que worker
async function joinDockerSwarm(managerIp: string, joinToken: string) {
  console.log("Rejoindre le cluster Docker Swarm...");
  
  // Commande pour rejoindre le cluster Swarm
  await runCommand(`sudo docker swarm join --token ${joinToken} ${managerIp}:2377`);
}

// Point d'entrée principal du script
if (import.meta.main) {
  const args = Deno.args;

  if (args.length < 1) {
    console.error("Usage : deno run --allow-net --allow-run setup_server.ts <manager|worker> [manager_ip] [join_token]");
    Deno.exit(1);
  }

  const role = args[0]; // "manager" ou "worker"
  
  try {
    // Installation des dépendances nécessaires
    await installDocker();
    await installWireGuard();

    if (role === "manager") {
      // Configuration du serveur manager
      await configureWireGuard("manager");
      await initializeDockerSwarm();
    } else if (role === "worker") {
      if (args.length < 3) {
        throw new Error("Pour un worker, fournissez l'IP du manager et le token de jointure.");
      }
      const managerIp = args[1];
      const joinToken = args[2];

      // Configuration du serveur worker
      await configureWireGuard("worker", managerIp);
      await joinDockerSwarm(managerIp, joinToken);
    } else {
      throw new Error("Le rôle doit être 'manager' ou 'worker'.");
    }

    console.log("Configuration terminée avec succès !");
    
  } catch (error) {
    console.error(`Erreur : ${error.message}`);
    Deno.exit(1);
  }
}