import { exec } from "https://deno.land/x/exec/mod.ts";
import { existsSync } from "https://deno.land/std/fs/mod.ts";

interface Recommendation {
  issue: string;
  action: string;
  command: string;
  severity: "high" | "medium" | "low";
  category: string;
}

const recommendations: Recommendation[] = [];

// Fonction utilitaire pour afficher du texte coloré
function colorText(text: string, color: string): string {
  const colors: Record<string, string> = {
    reset: "\x1b[0m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
  };
  return `${colors[color] || colors.reset}${text}${colors.reset}`;
}

async function runCommand(command: string): Promise<string> {
  try {
    const result = await exec(command, { stdout: "piped", stderr: "piped" });
    if (result.stdout && result.stdout.trim() !== "") {
      return result.stdout.trim();
    }
    if (result.status.code === 1) {
      return "OK";
    }
    if (result.status.code !== 0) {
      throw new Error(`La commande a échoué avec le code ${result.status.code}`);
    }
    return "Pas de données disponibles.";
  } catch (error) {
    return `Erreur : ${error.message}`;
  }
}

async function listDisksUsage(): Promise<void> {
  try {
    console.log("\n\n\n");
    console.log(colorText("-------------------------------------", "blue"));
    console.log(colorText("1. VÉRIFICATION DE L'ESPACE DISQUE", "blue"));
    console.log(colorText("-------------------------------------", "blue"));

    const cmd = new Deno.Command("df", {
      args: ["-h", "--output=source,size,pcent"],
    });
    
    const output = await cmd.output();
    const text = new TextDecoder().decode(output.stdout);
    
    const seenLines = new Set<string>();
    const diskInfo: Array<[string, string, string]> = [];
    
    const lines = text.trim().split("\n");
    
    lines.slice(1).forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 3) {
        const filesystem = parts[0];
        const size = parts[1];
        const usage = parts[2];
        const key = `${filesystem}`;
        
        if (!seenLines.has(key) && filesystem !== "none") {
          seenLines.add(key);
          diskInfo.push([filesystem, size, usage]);
        }
      }
    });

    console.log("Utilisation des disques:");
    console.log("╔════════════════════════════════════════════════════╤══════════╤══════════╗");
    console.log("║ Système de fichiers                                │ Taille   │ Usage    ║");
    console.log("╠════════════════════════════════════════════════════╪══════════╪══════════╣");
    
    diskInfo.forEach(([fs, size, usage]) => {
      const fsColumn = fs.padEnd(51);
      const usageValue = parseInt(usage);
      let coloredUsage;
      
      if (usageValue > 95) {
        coloredUsage = `\x1b[31m${usage.padStart(8)}\x1b[0m`; // Rouge
      } else if (usageValue >= 75) {
        coloredUsage = `\x1b[33m${usage.padStart(8)}\x1b[0m`; // Jaune
      } else {
        coloredUsage = `\x1b[32m${usage.padStart(8)}\x1b[0m`; // Vert
      }
      
      console.log(
        `║ ${fsColumn}│ ${size.padEnd(8)} │ ${coloredUsage} ║`
      );
      if (usageValue > 90) {
        recommendations.push({
          issue: `Le système de fichiers ${fs} est presque plein (${usage})`,
          action: "Nettoyer l'espace disque ou augmenter la taille",
          command: `sudo apt-get clean && sudo apt-get autoremove`,
          severity: "high",
          category: "Storage"
        })
      }
    });
    
    console.log("╚════════════════════════════════════════════════════╧══════════╧══════════╝");

  } catch (error) {
    console.error("Erreur:", error.message);
  }
}

async function checkOpenPorts(): Promise<void> {
  try {
    console.log("\n\n\n");
    console.log(colorText("-------------------------------------", "blue"));
    console.log(colorText("2. VÉRIFICATION DES PORTS OUVERTS", "blue"));
    console.log(colorText("-------------------------------------", "blue"));

    const cmd = new Deno.Command("ss", {
      args: ["-tulnp", "state", "listening"],
    });
    
    const output = await cmd.output();
    const text = new TextDecoder().decode(output.stdout);
    const lines = text.trim().split("\n");

    console.log("Ports ouverts:");
    console.log("╔═══════════╤══════════════════╤══════════════════════════════╗");
    console.log("║ Protocole │ Adresse:Port     │ Processus                    ║");
    console.log("╠═══════════╪══════════════════╪══════════════════════════════╣");

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      const columns = line.split(/\s+/);

      if (columns.length >= 6) {
        const protocol = columns[0].padEnd(9);
        const address = columns[3].padEnd(16);
        let processInfo = columns[columns.length - 1];
        
        // Extraire le nom du processus
        const processMatch = processInfo.match(/\("([^"]+)"/);
        let processName = processMatch ? processMatch[1] : processInfo;
        
        const pidMatch = processInfo.match(/pid=(\d+)/);
        if (pidMatch) {
          const pid = pidMatch[1];
          try {
            const dockerCmd = new Deno.Command("docker", {
              args: ["ps", "--format", "{{.Names}}", "--filter", `pid=${pid}`],
            });
            const dockerOutput = await dockerCmd.output();
            const containerName = new TextDecoder().decode(dockerOutput.stdout).trim();
            
            if (containerName) {
              processName = `container:${containerName}`;
            }
          } catch (_) {
            // Ignore docker command errors
          }
        }

        processName = processName.padEnd(31);
        
        console.log(
          `║ \x1b[34m${protocol}\x1b[0m│ \x1b[32m${address}\x1b[0m│ \x1b[33m${processName}\x1b[0m║`
        );
      }
    }
    
    console.log("╚═══════════╧══════════════════╧══════════════════════════════╝");
    console.log("\x1b[32mRÉSULTAT : OK\x1b[0m");


    
  } catch (error) {
    console.error("\x1b[31mImpossible de récupérer la liste des ports ouverts.\x1b[0m");
    console.log("\x1b[31mRÉSULTAT : NON CONFORME\x1b[0m");
  }
}


// Fonction pour récupérer le nom du conteneur Docker à partir d'un PID
async function getDockerContainerName(pid: string): Promise<string | null> {
  try {
    const cgroupPath = `/proc/${pid}/cgroup`;
    const cgroupContent = await Deno.readTextFile(cgroupPath);
    
    const containerIdMatch = cgroupContent.match(/[0-9a-f]{64}/);
    
    if (containerIdMatch) {
      const containerId = containerIdMatch[0];
      const containerName = await runCommand(`docker inspect --format '{{.Name}}' ${containerId}`);
      
      return containerName.replace(/^\//, "");
    }
    
  } catch {
    return null;
  }
  
  return null;
}

async function listSSHConfig(): Promise<void> {
  try {
    console.log("\n\n\n");
    console.log(colorText("-------------------------------------", "blue"));
    console.log(colorText("3. VÉRIFICATION DE LA CONFIGURATION SSH", "blue")); 
    console.log(colorText("-------------------------------------", "blue"));

    // Lire la configuration SSH
    const cmd = new Deno.Command("cat", {
      args: ["/etc/ssh/sshd_config"],
    });
    
    const output = await cmd.output();
    const config = new TextDecoder().decode(output.stdout);

    const sshConfig = await Deno.readTextFile("/etc/ssh/sshd_config");

    // Parser la configuration
    const lines = config.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("Port ")) sshConfig.port = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("PasswordAuthentication ")) sshConfig.passwordAuth = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("PermitRootLogin ")) sshConfig.rootLogin = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("MaxAuthTries ")) sshConfig.maxAuthTries = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("PermitEmptyPasswords ")) sshConfig.emptyPasswords = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("HostBasedAuthentication ")) sshConfig.hostBasedAuth = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("AllowTcpForwarding ")) sshConfig.tcpForwarding = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("X11Forwarding ")) sshConfig.x11Forwarding = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("Protocol ")) sshConfig.protocol = trimmedLine.split(" ")[1];
      if (trimmedLine.startsWith("Ciphers ")) sshConfig.ciphers = trimmedLine.split(" ")[1];
    }

    // Affichage avec coloration selon la sécurité
    function colorValue(value: string, paramName: string): string {
      const green = '\x1b[32m';
      const red = '\x1b[31m';
      const reset = '\x1b[0m';

      switch(paramName) {
        case 'Port':
          return value !== '22' ? `${green}${value}${reset}` : `${red}${value}${reset}`;
        case 'Protocol':
          return value === '2' ? `${green}${value}${reset}` : `${red}${value}${reset}`;
        case 'PasswordAuth':
        case 'RootLogin':
        case 'EmptyPasswords':
        case 'HostBasedAuth':
        case 'TcpForwarding':
        case 'X11Forwarding':
          return value === 'no' ? `${green}${value}${reset}` : `${red}${value}${reset}`;
        case 'MaxAuthTries':
          return parseInt(value) <= 3 ? `${green}${value}${reset}` : `${red}${value}${reset}`;
        default:
          return value;
      }
    }

    // Affichage du tableau
    console.log("Configuration SSH Système:");
    console.log("╔════════════════════╤═════════════════════╗");
    console.log("║ Paramètre          │ Valeur              ║");
    console.log("╠════════════════════╪═════════════════════╣");
    console.log(`║ Port SSH           │ ${colorValue(sshConfig.port, 'Port').padEnd(19)}║`);
    console.log(`║ Protocol Version   │ ${colorValue(sshConfig.protocol, 'Protocol').padEnd(19)}║`);
    console.log(`║ Auth par mot passe │ ${colorValue(sshConfig.passwordAuth, 'PasswordAuth').padEnd(19)}║`);
    console.log(`║ Login Root         │ ${colorValue(sshConfig.rootLogin, 'RootLogin').padEnd(19)}║`);
    console.log(`║ Max Auth Tries     │ ${colorValue(sshConfig.maxAuthTries, 'MaxAuthTries').padEnd(19)}║`);
    console.log(`║ Empty Passwords    │ ${colorValue(sshConfig.emptyPasswords, 'EmptyPasswords').padEnd(19)}║`);
    console.log(`║ Host Based Auth    │ ${colorValue(sshConfig.hostBasedAuth, 'HostBasedAuth').padEnd(19)}║`);
    console.log(`║ TCP Forwarding     │ ${colorValue(sshConfig.tcpForwarding, 'TcpForwarding').padEnd(19)}║`);
    console.log(`║ X11 Forwarding     │ ${colorValue(sshConfig.x11Forwarding, 'X11Forwarding').padEnd(19)}║`);
    console.log(`║ Ciphers            │ ${sshConfig.ciphers.padEnd(19)}║`);

    // Générer les recommandations
    if (sshConfig.port === "22") {
      recommendations.push({
        issue: "Port SSH standard (22) détecté",
        action: "Changer le port SSH par défaut pour réduire les attaques automatisées",
        command: "sudo sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config",
        severity: "medium",
        category: "Security"
      });
    }

    if (sshConfig.passwordAuth === "yes") {
      recommendations.push({
        issue: "Authentification par mot de passe SSH activée",
        action: "Désactiver l'authentification par mot de passe et utiliser uniquement les clés SSH",
        command: "sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config",
        severity: "high",
        category: "Security"
      });
    }

    if (sshConfig.rootLogin === "yes") {
      recommendations.push({
        issue: "Connexion root SSH autorisée",
        action: "Désactiver la connexion directe en root via SSH",
        command: "sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config",
        severity: "high",
        category: "Security"
      });
    }

    // Ajouter la recommandation de redémarrage si des changements sont nécessaires
    if (recommendations.length > 0) {
      recommendations.push({
        issue: "Le service SSH doit être redémarré pour appliquer les changements",
        action: "Redémarrer le service SSH",
        command: "sudo systemctl restart ssh",
        severity: "high",
        category: "Service"
      });
    }

  } catch (error) {
    console.error("\x1b[31mImpossible de lire la configuration SSH.\x1b[0m");
  }
}


async function checkRequiredApps(): Promise<void> {
  try {
    console.log("\n\n\n");
    console.log(colorText("-------------------------------------", "blue"));
    console.log(colorText("4. VÉRIFICATION DES APPLICATIONS REQUISES", "blue"));
    console.log(colorText("-------------------------------------", "blue"));


    const APP_REQUIRED = "docker.io,docker-compose,rsync,deno,nodejs,npm,python3,pip,git,wireguard-tools,prometheus,grafana,ansible,curl,lynis,chkrootkit,clamav,vuls,openvas,zaproxy,wapiti,fail2ban";
    const apps = APP_REQUIRED.split(",");

    console.log("╔════════════════════╤══════════╤═══════════╤═══════════════╤═══════════════╗");
    console.log("║ Application        │ Installé │ Actif     │ Version       │ Disponible    ║");
    console.log("╠════════════════════╪══════════╪═══════════╪═══════════════╪═══════════════╣");

    function cleanVersion(version: string): string {
      return version
        .replace(/^v/, '')
        .replace(/^1:/, '')
        .replace(/~ds.*$/, '')
        .replace(/\+.*$/, '')
        .replace(/-[^-]*ubuntu[^-]*$/, '')
        .replace(/^([0-9]+\.[0-9]+\.[0-9]+).*/, '$1')
        .trim();
    }

    // Fonction pour obtenir la dernière version disponible
    async function getLatestVersion(app: string): Promise<string> {
      try {
        switch(app) {
          case 'docker.io':
            try {
              // Vérifier d'abord si docker-ce est installé
              const dockerCECmd = new Deno.Command("dpkg", { 
                args: ["-l", "docker-ce"] 
              });
              const dockerCEOut = new TextDecoder().decode((await dockerCECmd.output()).stdout);
              
              if (dockerCEOut.includes("ii")) {
                installed = true;
                // Obtenir la version de docker-ce
                const versionCmd = new Deno.Command("docker", { args: ["version", "--format", "{{.Server.Version}}"] });
                installedVersion = new TextDecoder().decode((await versionCmd.output()).stdout).trim();
              } else {
                // Sinon vérifier docker.io
                const dockerIOCmd = new Deno.Command("dpkg", { args: ["-l", "docker.io"] });
                const dockerIOOut = new TextDecoder().decode((await dockerIOCmd.output()).stdout);
                installed = dockerIOOut.includes("ii");
                if (installed) {
                  const versionCmd = new Deno.Command("docker", { args: ["version", "--format", "{{.Server.Version}}"] });
                  installedVersion = new TextDecoder().decode((await versionCmd.output()).stdout).trim();
                }
              }
            } catch (_) {
              installed = false;
            }
            break;
          

          case 'docker-compose':
            // Vérifier la dernière version de Docker Compose
            const composeVersionCmd = new Deno.Command("curl", {
              args: ["-s", "https://api.github.com/repos/docker/compose/releases/latest"]
            });
            const composeJson = new TextDecoder().decode((await composeVersionCmd.output()).stdout);
            const composeData = JSON.parse(composeJson);
            return cleanVersion(composeData.tag_name);

          case 'deno':
            // Vérifier la dernière version de Deno
            const denoVersionCmd = new Deno.Command("curl", {
              args: ["-s", "https://api.github.com/repos/denoland/deno/releases/latest"]
            });
            const denoJson = new TextDecoder().decode((await denoVersionCmd.output()).stdout);
            const denoData = JSON.parse(denoJson);
            return cleanVersion(denoData.tag_name);

          default:
            // Pour les autres applications, utiliser apt-cache
            const aptCmd = new Deno.Command("apt-cache", { args: ["madison", app] });
            const aptOut = new TextDecoder().decode((await aptCmd.output()).stdout);
            if (aptOut.trim()) {
              return cleanVersion(aptOut.split("\n")[0].split("|")[1].trim());
            }
            return "";
        }
      } catch (_) {
        return "";
      }
    }

        // Fonction pour comparer les versions
    function compareVersions(v1: string, v2: string): number {
      if (!v1 || !v2) return 0;
      const v1Parts = v1.split('.').map(Number);
      const v2Parts = v2.split('.').map(Number);
      
      for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        if (v1Part > v2Part) return 1;
        if (v1Part < v2Part) return -1;
      }
      return 0;
    }

    // Mapping des services
    const serviceMapping: { [key: string]: string } = {
      'docker.io': 'docker.service',
      'prometheus': 'prometheus.service',
      'grafana': 'grafana-server.service',
      'fail2ban': 'fail2ban.service',
      'clamav': 'clamav-daemon.service'
    };

    for (const app of apps) {
      let installed = false;
      let active = "";
      let installedVersion = "";
      let availableVersion = "";

      try {
        // Vérifications spécifiques par application
        switch(app) {
          case 'docker.io':
            try {
              const dockerVersionCmd = new Deno.Command("docker", { args: ["--version"] });
              const dockerOut = new TextDecoder().decode((await dockerVersionCmd.output()).stdout);
              installed = true;
              installedVersion = cleanVersion(dockerOut.split(" ")[2]);
            } catch (_) {
              installed = false;
            }
            break;

          case 'docker-compose':
            try {
              const composeCmd = new Deno.Command("docker", { args: ["compose", "version"] });
              const composeOut = new TextDecoder().decode((await composeCmd.output()).stdout);
              installed = true;
              installedVersion = cleanVersion(composeOut.split(" ")[3]);
            } catch (_) {
              installed = false;
            }
            break;
            
          case 'deno':
            try {
              const denoCmd = new Deno.Command("deno", { args: ["--version"] });
              const denoOut = new TextDecoder().decode((await denoCmd.output()).stdout);
              installed = true;
              installedVersion = cleanVersion(denoOut.split(" ")[1]);
            } catch (_) {
              installed = false;
            }
            break;

          case 'nodejs':
            try {
              const nodeCmd = new Deno.Command("node", { args: ["--version"] });
              const nodeOut = new TextDecoder().decode((await nodeCmd.output()).stdout);
              installed = true;
              installedVersion = cleanVersion(nodeOut);
            } catch (_) {
              installed = false;
            }
            break;

          case 'python3':
            try {
              const pyCmd = new Deno.Command("python3", { args: ["--version"] });
              const pyOut = new TextDecoder().decode((await pyCmd.output()).stdout);
              installed = true;
              installedVersion = cleanVersion(pyOut.split(" ")[1]);
            } catch (_) {
              installed = false;
            }
            break;

          default:
            const dpkgCmd = new Deno.Command("dpkg", { args: ["-s", app] });
            try {
              const dpkgOut = new TextDecoder().decode((await dpkgCmd.output()).stdout);
              installed = dpkgOut.includes("Status: install ok installed");
              const versionMatch = dpkgOut.match(/Version: (.*)/);
              if (versionMatch) {
                installedVersion = cleanVersion(versionMatch[1]);
              }
            } catch (_) {
              installed = false;
            }
        }

        // Vérifier la version disponible pour toutes les applications
        try {
          availableVersion = await getLatestVersion(app);
        } catch (_) {
          availableVersion = "";
        }

        // Vérifier le statut du service si applicable
        if (serviceMapping[app]) {
          try {
            const statusCmd = new Deno.Command("systemctl", { 
              args: ["is-active", serviceMapping[app]]
            });
            active = new TextDecoder().decode((await statusCmd.output()).stdout).trim();
          } catch (_) {
            active = "inactive";
          }
        }

      } catch (error) {
        console.error(`Erreur pour ${app}:`, error);
      }

      // Modifier la partie d'affichage
      const installedStatus = installed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const activeStatus = !installed ? "\x1b[31mInactif\x1b[0m" :
                    active === "active" ? "\x1b[32mActif\x1b[0m" : 
                    active === "inactive" ? "\x1b[31mInactif\x1b[0m" : 
                    "\x1b[32mActif\x1b[0m";
            // Colorer les versions
      const versionColor = (installed: boolean, installedVer: string, availableVer: string): string => {
        if (!installed) return "";
        if (!availableVer) return installedVer;
        
        const comparison = compareVersions(installedVer, availableVer);
        if (comparison >= 0) {
          return `\x1b[32m${installedVer}\x1b[0m`; // Vert si à jour ou plus récent
        } else {
          return `\x1b[31m${installedVer}\x1b[0m`; // Rouge si obsolète
        }
      };
      console.log(
        `║ ${app.padEnd(19)}│ ${installedStatus.padEnd(17)} │ ${activeStatus.padEnd(18)} │ ${
          installed ? versionColor(installed, installedVersion.padEnd(14), availableVersion.padEnd(14)) : "".padEnd(14)}│ ${availableVersion.padEnd(14)}║`
      );
    }
    // Recommandations pour les applications de sécurité manquantes
    if (!apps.includes("clamav")) {
      recommendations.push({
        issue: "Antivirus ClamAV non installé",
        action: "Installer ClamAV",
        command: "sudo apt install clamav",
        severity: "medium",
        category: "Security"
        });
    }
    console.log("╚════════════════════╧══════════╧═══════════╧═══════════════╧═══════════════╝");
    // Recommandations pour les applications manquantes ou obsolètes
    for (const app of apps) {
      // Vérifier si l'application est installée
      const dpkgCmd = new Deno.Command("dpkg", { args: ["-s", app] });
      try {
        const dpkgOut = new TextDecoder().decode((await dpkgCmd.output()).stdout);
        const installed = dpkgOut.includes("Status: install ok installed");
        
        if (!installed) {
          // Applications de sécurité critiques
          if (["fail2ban", "clamav", "lynis", "chkrootkit"].includes(app)) {
            recommendations.push({
              issue: `${app} n'est pas installé (outil de sécurité critique)`,
              action: `Installer ${app} pour améliorer la sécurité du système`,
              command: `sudo apt install ${app}`,
              severity: "high",
              category: "Security"
            });
          }
          // Outils de monitoring
          else if (["prometheus", "grafana"].includes(app)) {
            recommendations.push({
              issue: `${app} n'est pas installé (outil de monitoring)`,
              action: `Installer ${app} pour le monitoring du système`,
              command: `sudo apt install ${app}`,
              severity: "medium",
              category: "Monitoring"
            });
          }
          // Autres applications importantes
          else if (["docker.io", "docker-compose", "git"].includes(app)) {
            recommendations.push({
              issue: `${app} n'est pas installé (outil système important)`,
              action: `Installer ${app}`,
              command: `sudo apt install ${app}`,
              severity: "medium",
              category: "System"
            });
          }
        }
        // Vérifier les versions obsolètes
        else {
          const installedVersion = await getLatestVersion(app);
          const availableVersion = await getLatestVersion(app);
          
          if (installedVersion && availableVersion && compareVersions(installedVersion, availableVersion) < 0) {
            recommendations.push({
              issue: `${app} nécessite une mise à jour (${installedVersion} -> ${availableVersion})`,
              action: `Mettre à jour ${app}`,
              command: `sudo apt update && sudo apt install ${app}`,
              severity: "low",
              category: "Updates"
            });
          }
        }
      } catch (_) {
        // Ignorer les erreurs
      }
    }
  } catch (error) {
    console.error("\x1b[31mErreur lors de la vérification des applications:", error, "\x1b[0m");
  }
}



// Validation des applications inutiles ou superflues
async function checkUnusedApps() { 
  console.log("\n\n\n");
  console.log(colorText("-------------------------------------", "blue"));
  console.log(colorText("5. IDENTIFICATION DES APPLICATIONS INUTILES", "blue"));
  console.log(colorText("-------------------------------------", "blue"));

  const unnecessaryApps = ["apache2", "vsftpd", "telnet"];
  let allConform = true;

  for (const app of unnecessaryApps) {
    const status = await runCommand(`dpkg -l | grep ${app}`);
    
    if (status === "OK") {
      console.log(colorText(`Application non trouvée : ${app}`, "green"));
    } else if (status.includes(app)) {
      allConform = false;
      console.error(colorText(`Application inutile détectée : ${app}`, "red"));
    } else {
      allConform = false;
      console.error(colorText(status, "red"));
    }
  }

  if (allConform) {
    console.log(colorText("RÉSULTAT : OK", "green"));
  } else {
    console.error(colorText("RÉSULTAT : NON CONFORME", "red"));
  }
}

// Validation des journaux système récents
async function checkSystemLogs() { 
  console.log("\n\n\n");
  console.log(colorText("-------------------------------------", "blue"));
  console.log(colorText("6. ANALYSE DES JOURNAUX SYSTÈME", "blue"));
  console.log(colorText("-------------------------------------", "blue"));

  const logs = await runCommand("journalctl --since '1 hour ago'");

  if (logs.includes("No journal files were found") || logs === "OK") {
    console.log(colorText("Aucun journal récent trouvé.", "green"));
    console.log(colorText("RÉSULTAT : OK", "green"));
  } else if (!logs.startsWith("Erreur")) {
    console.log(colorText(logs, "green"));
    console.log(colorText("RÉSULTAT : OK", "green"));
  } else {
    console.error(colorText("Erreur lors de la récupération des journaux système.", "red"));
    console.error(colorText("RÉSULTAT : NON CONFORME", "red"));
  }
}

// Validation de la synchronisation de l'horloge système
async function checkTimeSync() { 
  console.log("\n\n\n");
  console.log(colorText("-------------------------------------", "blue"));
  console.log(colorText("7. SYNCHRONISATION DE L'HORLOGE SYSTÈME", "blue"));
  console.log(colorText("-------------------------------------", "blue"));

  const timeStatus = await runCommand("timedatectl");

  if (!timeStatus.startsWith("Erreur")) {
    if (timeStatus.includes("System clock synchronized: yes")) {
      console.log(colorText(timeStatus, "green"));
      console.log(colorText("RÉSULTAT : OK", "green"));
    } else {
      console.error(colorText(timeStatus, "yellow"));
      console.error(colorText("L'horloge système n'est pas synchronisée.", "red"));
      console.error(colorText("RÉSULTAT : NON CONFORME", "red"));
    }
    
  } else {
    console.error(colorText("Impossible de vérifier la synchronisation de l'horloge.", "red"));
    
   }
}

async function checkKernelVersion(): Promise<void> {
  try {
    console.log("\n\n\n");
    console.log(colorText("-------------------------------------", "blue"));
    console.log(colorText("8. VÉRIFICATION DU NOYAU LINUX", "blue"));
    console.log(colorText("-------------------------------------", "blue"));

    // Obtenir la version actuelle du noyau
    const unameCmd = new Deno.Command("uname", { args: ["-r"] });
    const currentVersion = new TextDecoder().decode((await unameCmd.output()).stdout).trim();

    // Obtenir la dernière version stable du noyau
    const latestVersion = "6.10.0";  // Version stable actuelle

    console.log("╔════════════════════╤═══════════════════╗");
    console.log("║ Version actuelle   │ Version disponible║");
    console.log("╠════════════════════╪═══════════════════╣");
    
    const versionColor = currentVersion >= latestVersion ? "\x1b[32m" : "\x1b[31m";
    console.log(`║ ${versionColor}${currentVersion.padEnd(19)}\x1b[0m│ ${latestVersion.padEnd(18)}║`);
    
    console.log("╚════════════════════╧═══════════════════╝");

  } catch (error) {
    console.error("\x1b[31mErreur lors de la vérification du noyau:", error, "\x1b[0m");
  }
}

async function showAndApplyRecommendations(): Promise<void> {
  try {
    console.log("\n-------------------------------------");
    console.log("RECOMMANDATIONS ET ACTIONS");
    console.log("-------------------------------------\n");

    if (recommendations.length === 0) {
      console.log("\x1b[32m✓ Aucune recommandation - Le système est bien configuré\x1b[0m");
      return;
    }

    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║ Recommandations de sécurité et maintenance                     ║");
    console.log("╠════════════════════════════════════════════════════════════════╣");

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const severityColor = rec.severity === "high" ? "\x1b[31m" : 
                           rec.severity === "medium" ? "\x1b[33m" : "\x1b[32m";
      
      console.log(`║ ${(i + 1).toString().padStart(2)}. ${severityColor}[${rec.severity.toUpperCase()}]\x1b[0m ${rec.issue}`);
      console.log(`║    → ${rec.action}`);
      console.log(`║    → Catégorie: ${rec.category}`);
      console.log(`║    → Commande: ${rec.command}`);
      console.log("║");
    }
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    console.log("Pour appliquer ces recommandations, exécutez les commandes suivantes :");
    console.log("-------------------------------------------------------------------");
    
    for (const rec of recommendations) {
      console.log(`\x1b[34m${rec.command}\x1b[0m`);
      
      // Afficher les dépendances si elles existent
      if (rec.dependencies?.includes("SSH Configuration")) {
        console.log("\x1b[33mAprès modification de la configuration SSH, exécutez :\x1b[0m");
        console.log("\x1b[34msudo systemctl restart ssh\x1b[0m");
      }
      console.log();
    }

  } catch (error) {
    console.error("\x1b[31mErreur lors de l'affichage des recommandations:", error, "\x1b[0m");
  }
}


// Point d'entrée principal du script
if (import.meta.main) {
  try {
    await listDisksUsage();
    await checkOpenPorts();
    await listSSHConfig();
    await checkRequiredApps();
    await checkUnusedApps();
    await checkSystemLogs();
    await checkTimeSync();
    await checkKernelVersion();

    await showAndApplyRecommendations();

    console.log(colorText("\nAnalyse terminée avec succès !", "green"));

  } catch (error) {
    console.error(
      colorText(`\nErreur critique lors de l'analyse : ${error.message}`, "red")
    );
  }
}