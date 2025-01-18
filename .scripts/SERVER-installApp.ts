import { exec } from "https://deno.land/x/exec/mod.ts";

async function installAndConfigurePrometheus(): Promise<void> {
    try {
      console.log("Installation et configuration de Prometheus...");
  
      // Installation de Prometheus
      const installCmd = new Deno.Command("sudo", {
        args: ["apt", "install", "-y", "prometheus"],
      });
      await installCmd.output();
  
      // Configuration de Prometheus
      const prometheusConfig = `
  global:
    scrape_interval: 15s
    evaluation_interval: 15s
    external_labels:
      monitor: 'system-monitor'
  
  scrape_configs:
    - job_name: 'prometheus'
      static_configs:
        - targets: ['localhost:9090']
    
    - job_name: 'node'
      static_configs:
        - targets: ['localhost:9100']
  
    - job_name: 'docker'
      static_configs:
        - targets: ['localhost:9323']
  `;
  
      // Écrire la configuration
      await Deno.writeTextFile("/tmp/prometheus.yml", prometheusConfig);
      const moveCmd = new Deno.Command("sudo", {
        args: ["mv", "/tmp/prometheus.yml", "/etc/prometheus/prometheus.yml"],
      });
      await moveCmd.output();
  
      // Définir les permissions
      const chownCmd = new Deno.Command("sudo", {
        args: ["chown", "prometheus:prometheus", "/etc/prometheus/prometheus.yml"],
      });
      await chownCmd.output();
  
      // Activer et démarrer le service
      const enableCmd = new Deno.Command("sudo", {
        args: ["systemctl", "enable", "prometheus"],
      });
      await enableCmd.output();
  
      const startCmd = new Deno.Command("sudo", {
        args: ["systemctl", "start", "prometheus"],
      });
      await startCmd.output();
  
      console.log("✓ Prometheus installé et configuré avec succès");
      console.log("Interface web disponible sur : http://localhost:9090");
  
    } catch (error) {
      console.error("Erreur lors de l'installation de Prometheus:", error);
    }
  }

  async function installAndConfigureWireguardClient(): Promise<void> {
    try {
      console.log("Installation et configuration du client Wireguard...");
  
      // Installation des paquets
      const installCmd = new Deno.Command("sudo", {
        args: ["apt-get", "install", "-y", "wireguard", "wireguard-tools"],
      });
      await installCmd.output();
  
      // Générer les clés du client
      const privateKeyCmd = new Deno.Command("wg", {
        args: ["genkey"],
      });
      const privateKeyOutput = await privateKeyCmd.output();
      const privateKey = new TextDecoder().decode(privateKeyOutput.stdout).trim();
  
      // Générer la clé publique
      const publicKeyCmd = new Deno.Command("echo", {
        args: [privateKey],
      });
      const echoOutput = await publicKeyCmd.output();
      const pubKeyCmd = new Deno.Command("wg", {
        args: ["pubkey"],
        stdin: "piped",
      });
      const publicKey = new TextDecoder().decode(echoOutput.stdout).trim();
  
      // Configuration du client avec connexion automatique au serveur
      const clientConfig = `[Interface]
  PrivateKey = ${privateKey}
  Address = 10.8.0.2/24
  DNS = 10.8.0.1
  
  [Peer]
  PublicKey = <CLÉ_PUBLIQUE_DU_SERVEUR>
  AllowedIPs = 0.0.0.0/0
  PersistentKeepalive = 25
  
  # Script de reconnexion automatique
  PostUp = /etc/wireguard/update-endpoint.sh
  `;
  
      // Script de mise à jour automatique de l'endpoint
      const updateScript = `#!/bin/bash
  while true; do
    SERVER_IP=$(dig +short <NOM_SERVEUR>)
    if [ ! -z "$SERVER_IP" ]; then
      wg set wg0 peer <CLÉ_PUBLIQUE_DU_SERVEUR> endpoint $SERVER_IP:51820
    fi
    sleep 60
  done
  `;
  
      // Écrire la configuration
      await Deno.writeTextFile("/tmp/wg0.conf", clientConfig);
      await Deno.writeTextFile("/tmp/update-endpoint.sh", updateScript);
      
      // Créer le répertoire wireguard si nécessaire
      const mkdirCmd = new Deno.Command("sudo", {
        args: ["mkdir", "-p", "/etc/wireguard"],
      });
      await mkdirCmd.output();
  
      // Déplacer les fichiers
      const moveConfCmd = new Deno.Command("sudo", {
        args: ["mv", "/tmp/wg0.conf", "/etc/wireguard/wg0.conf"],
      });
      await moveConfCmd.output();
  
      const moveScriptCmd = new Deno.Command("sudo", {
        args: ["mv", "/tmp/update-endpoint.sh", "/etc/wireguard/update-endpoint.sh"],
      });
      await moveScriptCmd.output();
  
      // Définir les permissions
      const chmodConfCmd = new Deno.Command("sudo", {
        args: ["chmod", "600", "/etc/wireguard/wg0.conf"],
      });
      await chmodConfCmd.output();
  
      const chmodScriptCmd = new Deno.Command("sudo", {
        args: ["chmod", "+x", "/etc/wireguard/update-endpoint.sh"],
      });
      await chmodScriptCmd.output();
  
      // Activer au démarrage
      const enableCmd = new Deno.Command("sudo", {
        args: ["systemctl", "enable", "wg-quick@wg0"],
      });
      await enableCmd.output();
  
      console.log("✓ Client Wireguard installé et configuré");
      console.log("Clé publique du client (à communiquer au serveur):", publicKey);
      console.log("Important: Remplacer <CLÉ_PUBLIQUE_DU_SERVEUR> et <NOM_SERVEUR> dans les fichiers de configuration situé dans /etc/wireguard/");
  
    } catch (error) {
      console.error("Erreur lors de l'installation du client Wireguard:", error);
    }
  }
  
// Function to install and configure WireGuard on Ubuntu
async function installWireGuardserver() {
  try {
    // Update the package list
    await exec("sudo apt update");

    // Install WireGuard
    await exec("sudo apt install wireguard -y");

    // Generate server keys
    await exec("wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey");

    // Configure IP forwarding
    await exec("sudo sysctl -w net.ipv4.ip_forward=1");

    // Create WireGuard configuration file
    const config = `
[Interface]
PrivateKey = $(cat /etc/wireguard/privatekey)
Address = 10.0.0.1/24
ListenPort = 51820

[Peer]
PublicKey = <ClientPublicKey>
AllowedIPs = 10.0.0.2/32
`;
    await Deno.writeTextFile("/etc/wireguard/wg0.conf", config);

    // Enable and start WireGuard service
    await exec("sudo systemctl enable wg-quick@wg0");
    await exec("sudo systemctl start wg-quick@wg0");

    console.log("WireGuard installation and configuration complete.");
  } catch (error) {
    console.error("Error installing WireGuard:", error);
  }
}

// Import necessary Deno modules
import { exec } from "https://deno.land/x/exec/mod.ts";

// Function to generate and display WireGuard keys and configuration instructions
async function generateWireGuardKeys() {
  try {
    // Generate private key for the client
    const privateKey = await exec("wg genkey");
    const privateKeyStr = privateKey.output.trim();

    // Generate public key for the client
    const publicKey = await exec(`echo ${privateKeyStr} | wg pubkey`);
    const publicKeyStr = publicKey.output.trim();

    // Display the keys
    console.log("Client Private Key:", privateKeyStr);
    console.log("Client Public Key:", publicKeyStr);

    // Save keys to files
    await Deno.writeTextFile("/etc/wireguard/client_private.key", privateKeyStr);
    await Deno.writeTextFile("/etc/wireguard/client_public.key", publicKeyStr);

    // Instructions for server configuration
    console.log("\nInstructions pour configurer le serveur WireGuard :");
    console.log(`
1. Ajoutez ce bloc à votre fichier de configuration du serveur (wg0.conf) :

[Peer]
PublicKey = ${publicKeyStr}
AllowedIPs = 10.0.0.2/32

2. Redémarrez le service WireGuard sur le serveur :
   sudo systemctl restart wg-quick@wg0

3. Sur le client, créez un fichier de configuration /etc/wireguard/wg0-client.conf avec le contenu suivant :

[Interface]
PrivateKey = ${privateKeyStr}
Address = 10.0.0.2/24

[Peer]
PublicKey = <ServerPublicKey>
Endpoint = <ServerIP>:51820
AllowedIPs = 0.0.0.0/0

Remplacez <ServerPublicKey> par la clé publique de votre serveur et <ServerIP> par l'adresse IP de votre serveur.

4. Démarrez l'interface WireGuard sur le client :
   sudo wg-quick up wg0-client
`);

  } catch (error) {
    console.error("Erreur lors de la génération des clés WireGuard :", error);
  }
}

// Run the function
generateWireGuardKeys();



if (import.meta.main) {
    //await installAndConfigurePrometheus();
    //await installAndConfigureWireguardClient();
    //await installWireGuardserver();
    generateWireGuardKeys();
}
  
