import { config as loadEnv } from "dotenv";
import { join } from "std/path/mod.ts";
import { exists } from "std/fs/mod.ts";
import { red, bold, cyan, green, yellow } from "https://deno.land/std@0.192.0/fmt/colors.ts";

const errorsFile = "./errors.json";
const archiveFile = "./ErrorArchive.json";

/**
 * Enregistre les informations d'une erreur dans un fichier log.
 * @param error - L'erreur à enregistrer.
 * @param logfile - Le chemin du fichier journal où stocker l'erreur.
 */



// Définition des interfaces
interface ItfPodGen {
  domain: string;
  email: string;
  id: string;
  name: string;
  dir_key: string;
  dir_path: string;
  env_file: string;
  ipn_active: string;
  ipn_backup1: string;
  ipn_backup2: string;
  ipn_backup3: string;
  prt_http: string;
  prt_https: string;
  prt_proxy: string;
  prt_wireguard: string;
  url_server: string;
}
interface ItfPodSvc {
  domain: string;
  email: string;
  id: string;
  name: string;
  devVersion: string;
  prodVersion: string;
  dir_key: string;
  dir_path: string;
  env_file_dev: string;
  env_file_prod: string;
  ipn_active: string;
  ipn_backup1: string;
  ipn_backup2: string;
  ipn_backup3: string;
  prt_http: string;
  prt_https: string;
  prt_proxy: string;
  prt_wireguard: string;
  url_server: string;
  url_frontend: string;
  url_backend: string;
  yml_dev: string;
  yml_prod: string;
}
interface LoggedError {
  id: number;
  message: string;
  stack: string | null;
  firstOccurrence: string;
  lastOccurrence: string;
  count: number;
}
interface TypeService {
  app: ItfPodGen;
  svc: ItfPodSvc;
  svr: ItfPodGen;
  org: ItfPodGen;
}
interface CommandOptions {
  build: boolean;
  detached: boolean;
  down: boolean;
  restart: boolean;
  up: boolean;
}

// Types des commandes Docker
type DockerCommand = "up" | "down" | "restart";

const defaultCommandOptions: CommandOptions = {
  build: false,
  detached: false,
  down: false,
  restart: false,
  up: true, // Commande par défaut
};

async function archiveError(errorId: number): Promise<void> {
  if (!(await exists(errorsFile))) {
    console.error("Fichier d'erreurs introuvable.");
    return;
  }

  const data = await Deno.readTextFile(errorsFile);
  let errors: LoggedError[] = [];
  try {
    errors = JSON.parse(data);
  } catch (e) {
    console.error("Erreur lors du parsing du fichier d'erreurs :", e);
    return;
  }

  const errorIndex = errors.findIndex(e => e.id === errorId);
  if (errorIndex === -1) {
    console.error("Erreur avec l'ID spécifié non trouvée.");
    return;
  }

  const [errorToArchive] = errors.splice(errorIndex, 1);

  try {
    await Deno.writeTextFile(errorsFile, JSON.stringify(errors, null, 2));
  } catch (writeError) {
    console.error("Erreur lors de l'écriture dans le fichier d'erreurs :", writeError);
  }

  let archive: LoggedError[] = [];
  if (await exists(archiveFile)) {
    const archiveData = await Deno.readTextFile(archiveFile);
    try {
      archive = JSON.parse(archiveData);
    } catch {
      console.error("Erreur lors du parsing du fichier d'archive. Réinitialisation.");
      archive = [];
    }
  }

  archive.push(errorToArchive);

  try {
    await Deno.writeTextFile(archiveFile, JSON.stringify(archive, null, 2));
  } catch (writeError) {
    console.error("Erreur lors de l'écriture dans le fichier d'archive :", writeError);
  }
}
async function validateAndHandleSwarmNetwork(networkId: string): Promise<boolean> {
  try {
    console.log(`Inspection du réseau ${networkId} pour vérifier s'il est lié à un Swarm...`);

    // Inspecter le réseau
    const inspectCmd = new Deno.Command("docker", {
      args: ["network", "inspect", networkId],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await inspectCmd.output();

    if (code !== 0) {
      console.error("Erreur lors de l'inspection du réseau:", new TextDecoder().decode(stderr));
      return false;
    }

    const inspectOutput = new TextDecoder().decode(stdout);
    const networkData = JSON.parse(inspectOutput);
    const isSwarmNetwork = networkData[0]?.Scope === "swarm";

    if (!isSwarmNetwork) {
      console.log(`Le réseau ${networkId} n'est pas lié à un Swarm.`);
      return true; // Pas de problème, continuer le processus
    }

    console.log(`Le réseau ${networkId} est lié à un Swarm Docker.`);

    // Demander confirmation à l'utilisateur
    const buf = new Uint8Array(1024);
    console.log("Souhaitez-vous forcer l'arrêt des services/tâches liés à ce réseau ? (o/n)");
    const n = await Deno.stdin.read(buf);

    if (!n) {
      console.log("Aucune entrée détectée. Annulation de la procédure.");
      return false;
    }

    const input = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    if (input !== "o") {
      console.log("Procédure annulée par l'utilisateur.");
      return false;
    }

    // Lister les services liés au réseau
    console.log(`Récupération des services liés au réseau ${networkId}...`);
    const serviceLsCmd = new Deno.Command("docker", {
      args: ["service", "ls", "--filter", `network=${networkId}`, "--format", "{{.ID}}"],
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout: servicesOut, code: servicesCode } = await serviceLsCmd.output();

    if (servicesCode !== 0) {
      console.error("Erreur lors de la récupération des services liés au réseau.");
      return false;
    }

    const services = new TextDecoder().decode(servicesOut).split("\n").filter(Boolean);

    if (services.length === 0) {
      console.log("Aucun service lié au réseau trouvé.");
    } else {
      console.log(`Services liés au réseau ${networkId}: ${services.join(", ")}`);
      for (const serviceId of services) {
        console.log(`Suppression du service ${serviceId}...`);
        const rmCmd = new Deno.Command("docker", {
          args: ["service", "rm", serviceId],
        });
        const { code: rmCode } = await rmCmd.output();

        if (rmCode !== 0) {
          console.error(`Erreur lors de la suppression du service ${serviceId}.`);
          return false;
        }
      }
    }

    console.log(`Tous les services liés au réseau ${networkId} ont été arrêtés. Vous pouvez poursuivre.`);
    return true;
  } catch (error) {
    console.error("Erreur lors de la validation et du traitement du réseau:", error);
    return false;
  }
}

async function automateDockerNetworkCleanup(networkId: string, restartDocker: boolean = false): Promise<void> {
  try {
    console.log(`Inspection du réseau ${networkId}...`);
    const inspectCmd = new Deno.Command("docker", {
      args: ["network", "inspect", networkId],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await inspectCmd.output();

    // Si l'inspection échoue parce que le réseau n'existe pas, ignorer l'étape de suppression
    if (code !== 0) {
      const errMsg = new TextDecoder().decode(stderr);
      if (errMsg.includes("not found")) {
        console.log(`Le réseau ${networkId} n'a pas été trouvé. Il peut déjà être supprimé.`);
      } else {
        console.error("Erreur lors de l'inspection du réseau:", errMsg);
        return;
      }
    } else {
      const inspectOutput = new TextDecoder().decode(stdout);
      const inspectData = JSON.parse(inspectOutput);
      const networkInfo = inspectData[0];
      const containers = networkInfo.Containers ? Object.keys(networkInfo.Containers) : [];

      if (containers.length === 0) {
        console.log("Aucun conteneur n'utilise ce réseau.");
      } else {
        console.log(`Conteneurs utilisant le réseau ${networkId}: ${containers.join(", ")}`);
        for (const containerId of containers) {
          console.log(`Arrêt du conteneur ${containerId}...`);
          await new Deno.Command("docker", { args: ["container", "stop", containerId] }).output();

          console.log(`Suppression du conteneur ${containerId}...`);
          await new Deno.Command("docker", { args: ["container", "rm", containerId] }).output();
        }
      }

      console.log(`Suppression du réseau ${networkId}...`);
      try {
        const { code, stderr } = await new Deno.Command("docker", { args: ["network", "rm", networkId] }).output();
        if (code !== 0) {
          const removalError = new TextDecoder().decode(stderr);
          if (removalError.includes("in use by task")) {
            console.warn(`Le réseau ${networkId} est toujours utilisé par une tâche. Suppression ignorée.`);
          } else {
            console.error(`Échec de la suppression du réseau ${networkId}: ${removalError}`);
          }
        }
      } catch (e) {
        console.error(`Exception lors de la tentative de suppression du réseau: ${e}`);
      }

    }

    console.log("Nettoyage des ressources Docker inutilisées...");
    const pruneCmd = new Deno.Command("docker", {
      args: ["system", "prune", "-f"],
      stdout: "inherit",
      stderr: "inherit",
    });
    await pruneCmd.output();

    if (restartDocker) {
      console.log("Redémarrage du service Docker...");
      await Promise.race([
        new Promise((resolve) => setTimeout(resolve, 30000)), // Timeout de 30 secondes
        new Deno.Command("sudo", { args: ["systemctl", "restart", "docker"] }).output()
      ]);
    } else {
      console.log("Redémarrage du service Docker non requis.");
    }

    console.log("Processus d'automatisation terminé.");
  } catch (error) {
    console.error("Erreur dans l'automatisation:", error);
  }
}

async function DetachTerminal(): Promise<boolean> {
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  
  // Si aucune donnée n'est lue (fin d'entrée), on ne détache pas.
  if (n === null) {
    return false;
  }

  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();

  if (input === "x") {
    console.log("Détachement du processus en arrière-plan...");
    // Prépare les arguments pour le mode détaché
    const newArgs = [...Deno.args];
    if (!newArgs.includes("-d")) newArgs.push("-d");

    // Lance une nouvelle instance détachée du script
    const detachCmd = new Deno.Command("deno", {
      args: ["run", "--allow-run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", ...newArgs],
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
    detachCmd.spawn(); 
    console.log("Processus lancé en arrière-plan. Vous pouvez fermer ce terminal.");
    return true;  // Indique que le détachement a eu lieu
  }

  return false;  // Aucun détachement si l'entrée n'est pas "x"
}
function initializeSubObjects(svc: TypeService): void {
  svc.svr ??= {} as ItfPodGen;
  svc.org ??= {} as ItfPodGen;
  svc.app ??= {} as ItfPodGen;
  svc.svc ??= {} as ItfPodSvc;
}
async function convertHostToNamedVolume(
  hostPath: string,
  volumeName: string,
): Promise<boolean> {
  try {
    const tempContainer = new Deno.Command("docker", {
      args: [
        "run", "-d", "--name", "temp-volume-container",
        "-v", `${volumeName}:/dest`,
        "alpine", "tail", "-f", "/dev/null",
      ],
    });
    const containerOutput = await tempContainer.output();
    if (containerOutput.code !== 0) {
      throw new Error(`Échec de la création du conteneur temporaire`);
    }

    const copyData = new Deno.Command("docker", {
      args: ["cp", `${hostPath}/.`, "temp-volume-container:/dest/"],
    });
    const copyOutput = await copyData.output();
    if (copyOutput.code !== 0) {
      throw new Error(`Échec de la copie des données vers le conteneur`);
    }

    const chown = new Deno.Command("docker", {
      args: ["exec", "temp-volume-container", "chown", "-R", "1000:1000", "/dest"],
    });
    const chownOutput = await chown.output();
    if (chownOutput.code !== 0) {
      throw new Error(`Échec du changement de permissions`);
    }

    const cleanup = new Deno.Command("docker", {
      args: ["rm", "-f", "temp-volume-container"],
    });
    await cleanup.output();

    return true;
  } catch (error) {
    console.error(`Erreur lors de la conversion : ${error.message}`);
    return false;
  }
}
function getOS(): string {
  return Deno.build.os;  // Renvoie "windows", "linux" ou "darwin"
}
async function copyLogToClipboard(filePath: string): Promise<void> {
  try {
    if (!(await exists(filePath))) {
      console.warn(`Le fichier ${filePath} n'existe pas. Aucun contenu à copier.`);
      return;
    }

    const content = await Deno.readTextFile(filePath);
    const os = getOS();
    let command: Deno.Command;

    if (os === "linux") {
      command = new Deno.Command("xclip", {
        args: ["-selection", "clipboard"],
        stdin: "piped",
        stdout: "null",
        stderr: "null"
      });
    } else if (os === "darwin") {
      command = new Deno.Command("pbcopy", {
        stdin: "piped",
        stdout: "null",
        stderr: "null"
      });
    } else if (os === "windows") {
      command = new Deno.Command("powershell", {
        args: ["-Command", "Set-Clipboard"],
        stdin: "piped",
        stdout: "null",
        stderr: "null"
      });
    } else {
      console.error("OS non supporté pour la copie dans le presse-papier.");
      return;
    }

    const child = command.spawn();
    if (child.stdin) {
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(content));
      writer.close();
    }
    const status = await child.status;
    if (status.code !== 0) {
      console.error("Erreur lors de la copie dans le presse-papier.");
    } else {
      console.log("Le contenu du fichier a été copié dans le presse-papier.");
    }
  } catch (error) {
    console.error("Erreur lors de la copie dans le presse-papier:", error.message);
    await logError(error);
  }
}
async function findDirectory(PathSearch: string, dirKey: string): Promise<string> {
  try {
    for await (const entry of Deno.readDir(PathSearch)) {
      if (entry.isDirectory && entry.name.startsWith(`${dirKey}-`)) {
        return `${PathSearch}/${entry.name}`; // Retourne directement le chemin trouvé
      }
    }
    // console.warn(`Aucun répertoire trouvé débutant par la clé : ${dirKey} à l'emplacement ${PathSearch}`);
    return ""; // Retourne une chaîne vide au lieu de null
  } catch (error) {
    console.error(`Aucun répertoire trouvé débutant par la clé : ${dirKey} à l'emplacement ${PathSearch}`);
    return ""; // Retourne une chaîne vide au lieu de null
  }
}
async function findFile(
  PathSearch: string,
  fileKey: string,
  fileExt: string,
): Promise<string> {
  try {
    for await (const entry of Deno.readDir(PathSearch)) {
      if (
        !entry.isDirectory &&
        entry.name.startsWith(`${fileKey}-`) &&
        entry.name.endsWith(fileExt)
      ) {
        const filePath = `${PathSearch}/${entry.name}`;
        if (await exists(filePath)) {
          return filePath;
        }
      }
    }
    // console.warn(`Aucun fichier trouvé débutant par la clé : ${fileKey} avec l'extension : ${fileExt}`);
    return "";
  } catch (error) {
    console.error(`Aucun fichier trouvé débutant par la clé : ${fileKey} avec l'extension : ${fileExt} à l'emplacement ${PathSearch}`);
    return "";
  }
}
async function logError(error: Error): Promise<void> {
  const timestamp = new Date().toISOString();
  let errors: LoggedError[] = [];

  // Charge les erreurs existantes depuis le fichier, si disponible
  if (await exists(errorsFile)) {
    const data = await Deno.readTextFile(errorsFile);
    try {
      errors = JSON.parse(data);
    } catch {
      console.error("Erreur lors du parsing du fichier d'erreurs. Réinitialisation de la liste.");
      errors = [];
    }
  }

  // Recherche une erreur identique basée sur le message uniquement
  const existingError = errors.find(e => e.message === error.message);

  if (existingError) {
    existingError.lastOccurrence = timestamp;
    existingError.count += 1;
    // Mise à jour optionnelle de la stack si nécessaire
    existingError.stack = error.stack || existingError.stack;
  } else {
    const newId = errors.length > 0 ? Math.max(...errors.map(e => e.id)) + 1 : 1;
    const newError: LoggedError = {
      id: newId,
      message: error.message,
      stack: error.stack || null,
      firstOccurrence: timestamp,
      lastOccurrence: timestamp,
      count: 1,
    };
    errors.push(newError);
  }

  try {
    await Deno.writeTextFile(errorsFile, JSON.stringify(errors, null, 2));
  } catch (writeError) {
    console.error("Erreur lors de l'écriture dans le fichier d'erreurs :", writeError);
  }
}
async function validateFile(path: string): Promise<void> {
  if (!await exists(path)) {
    throw new Error(`Le fichier ${path} n'existe pas`);
  }
}
function parseCommand(args: string[]): { dockerCmd: CommandOptions} {
  const commandOptions = { ...defaultCommandOptions };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--build") {
      commandOptions.build = true;
    } else if (arg === "-d") {
      commandOptions.detached = true;
    } else if (arg === "up") {
      commandOptions.up = true;
      commandOptions.down = false;
      commandOptions.restart = false; 
    } else if (arg === "down") {
      commandOptions.down = true; 
      commandOptions.up = false; 
      commandOptions.restart = false; 
    } else if (arg === "restart") {
      commandOptions.restart = true; 
      commandOptions.up = false; 
      commandOptions.down = false; 
    }
  }

  return { dockerCmd: commandOptions };
}
async function parsePath(args: string[],verbose: boolean): Promise<TypeService> {
  const svc: TypeService = {
    app: {} as ItfPodGen,
    svc: {} as ItfPodSvc,
    svr: {} as ItfPodGen,
    org: {} as ItfPodGen,
  };

  initializeSubObjects(svc);

  for (const arg of args) {
    // Vérifie si l'argument n'est pas une commande connue
    if (
      arg !== "--build" &&
      arg !== "-d" &&
      arg !== "up" &&
      arg !== "down" &&
      arg !== "restart"
    ) {
      // Vérifie que l'argument est bien une chaîne de 5 caractères
      if (arg.length !== 5) {
        throw new Error("Le format du service doit être de 5 caractères (ex: 01310)");
      }

      // Extraction des informations à partir de l'argument
      svc.svr.dir_path = Deno.cwd(); // Définit le chemin courant comme base
      svc.svr.env_file = join(svc.svr.dir_path, `000000-SRV.env`);
      if (!svc.svr.dir_path) {
        throw new Error(`Impossible de trouver le répertoire de base`);
      }

      // Recherche du répertoire et du fichier pour l'organisation
      svc.org.id = '0' + arg[0] + '0000';
      svc.org.dir_path = await findDirectory(svc.svr.dir_path, `0${svc.org.id}`);
      svc.org.env_file = await findFile(svc.org.dir_path, svc.org.id, 'env');

      // Recherche du répertoire et du fichier pour l'application
      svc.app.id = arg[0] + arg[1] + '000';
      svc.app.dir_path = await findDirectory(svc.org.dir_path, `0${svc.app.id}`);
      svc.app.env_file = await findFile(svc.app.dir_path, svc.app.id, 'env');

      // Recherche du répertoire et des fichiers pour le service
      svc.svc.id = arg[0] + arg[1] + arg[2] + arg[3] + '0';
      svc.svc.devVersion = '0'+ arg[2] + arg[3] + arg[4];
      svc.svc.prodVersion = '0'+ arg[2] + arg[3] + '0';
      svc.svc.dir_path = await findDirectory(svc.app.dir_path, svc.svc.id);

      // Recherche des fichiers spécifiques au service
      svc.svc.env_file_dev = await findFile(svc.svc.dir_path, svc.svc.devVersion, 'env');
      svc.svc.env_file_prod = await findFile(svc.svc.dir_path, svc.svc.prodVersion, 'env');
      svc.svc.yml_dev = await findFile(svc.svc.dir_path, svc.svc.devVersion, 'yml');
      svc.svc.yml_prod = await findFile(svc.svc.dir_path, svc.svc.prodVersion, 'yml');
    }
  }

  if (!verbose) {
    displayServiceInfo(svc)
  }

  return svc;
}
async function displayServiceInfo(svc: TypeService): Promise<void> {
  try {
    console.log(bold(cyan("=== Informations sur le Service ===")));
    
    // Informations du serveur
    console.log(bold(green("\n[Serveur]")));
    console.log(`${bold("Chemin du répertoire :")} ${svc.svr.dir_path}`);
    console.log(`${bold("Fichier d'environnement :")} ${svc.svr.env_file}`);

    // Informations de l'organisation
    console.log(bold(green("\n[Organisation]")));
    console.log(`${bold("ID :")} ${svc.org.id}`);
    console.log(`${bold("Chemin du répertoire :")} ${svc.org.dir_path}`);
    console.log(`${bold("Fichier d'environnement :")} ${svc.org.env_file || yellow("Non trouvé")}`);

    // Informations de l'application
    console.log(bold(green("\n[Application]")));
    console.log(`${bold("ID :")} ${svc.app.id}`);
    console.log(`${bold("Chemin du répertoire :")} ${svc.app.dir_path}`);
    console.log(`${bold("Fichier d'environnement :")} ${svc.app.env_file || yellow("Non trouvé")}`);

    // Informations du service
    console.log(bold(green("\n[Service]")));
    console.log(`${bold("ID :")} ${svc.svc.id}`);
    console.log(`${bold("Version Dev :")} ${svc.svc.devVersion}`);
    console.log(`${bold("Version Prod :")} ${svc.svc.prodVersion}`);
    console.log(`${bold("Chemin du répertoire :")} ${svc.svc.dir_path}`);
    
    // Fichiers spécifiques au service
    console.log(bold("\nFichiers liés au Service :"));
    console.log(`${bold("Fichier env (Dev) :")} ${svc.svc.env_file_dev || yellow("Non trouvé")}`);
    console.log(`${bold("Fichier env (Prod) :")} ${svc.svc.env_file_prod || yellow("Non trouvé")}`);
    console.log(`${bold("Fichier YML (Dev) :")} ${svc.svc.yml_dev || yellow("Non trouvé")}`);
    console.log(`${bold("Fichier YML (Prod) :")} ${svc.svc.yml_prod || yellow("Non trouvé")}`);

  } catch (error) {
    console.error(red(`Erreur lors de l'affichage des informations : ${error.message}`));
  }
}
function interpolateEnvVars(envVars: Record<string, string>): Record<string, string> {
  const interpolated: Record<string, string> = {};

  for (let i = 0; i < 3; i++) { // Plusieurs passes pour résoudre les dépendances imbriquées
    for (const [key, value] of Object.entries(envVars)) {
      interpolated[key] = value.replace(/\${(\w+)}|\$(\w+)/g, (_, p1, p2) => {
        const varName = p1 || p2;
        return interpolated[varName] || envVars[varName] || "";
      });
    }
  }

  return interpolated;
}
async function loadEnvFiles(svc: TypeService, verbose: boolean = false): Promise<Record<string, string>> {
  const envVars: Record<string, string> = {};

  try {
    // Charger les fichiers d'environnement pour chaque niveau (serveur, organisation, application, service)
    const envFiles = [
      svc.svr.env_file,
      svc.org.env_file,
      svc.app.env_file,
      svc.svc.env_file_dev,
      svc.svc.env_file_prod,
    ];

    for (const file of envFiles) {
      if (file && await exists(file)) {
        const env = await loadEnv({ path: file });
        Object.assign(envVars, env); // Fusionner les variables chargées
      if (!verbose) { console.log(`✓ Fichier chargé: ${file}`);} 
      }      
    else {
        console.warn(`ℹ Fichier non trouvé ou optionnel: ${file}`);
      }
    }

    if (Object.keys(envVars).length === 0) {
      throw new Error("Aucune variable d'environnement n'a été chargée");
    }

    const interpolatedVars = interpolateEnvVars(envVars);

    if (!verbose) {
      console.log("\nVariables d'environnement chargées:");
      console.log("------------------------------------");
      Object.entries(interpolatedVars).forEach(([key, value]) => {
        console.log(`${key}: ${value}`);
      });
      console.log("------------------------------------\n");
    }

    return interpolatedVars;
  } catch (error) {
    console.error("Erreur lors du chargement des fichiers d'environnement:", error.message);
    throw error;
  }
}
async function runDockerCompose(
  commandOptions: CommandOptions,
  serviceInfo: TypeService,
  envVars: Record<string, string>,
  retry: boolean = false
) {
  try {
    const dockerComposeFile = join(serviceInfo.svc.dir_path, `${serviceInfo.svc.devVersion}-docker-compose.yml`);
    
    // Valider l'existence du fichier Docker Compose
    await validateFile(dockerComposeFile);

    const dockerComposeCommand = [
      "docker",
      "compose",
      "-f",
      dockerComposeFile,
      "-p",
      envVars.PROJECT_NAME,
      commandOptions.up ? "up" : commandOptions.down ? "down" : "restart",
    ];

    if (commandOptions.build) {
      dockerComposeCommand.push("--build");
    }

    if (!commandOptions.detached) {
      console.log(`\nExécution de la commande Docker Compose: ${dockerComposeCommand.join(" ")}`);
      const cmd = new Deno.Command(dockerComposeCommand[0], {
        args: dockerComposeCommand.slice(1),
        env: envVars,
        stdout: "inherit",  // Affichage en temps réel
        stderr: "piped",    // Piping pour capturer stderr
      });
      const { code, stderr } = await cmd.output();

      if (code !== 0) {
        const errorOutput = new TextDecoder().decode(stderr);
        throw new Error(`La commande Docker Compose a échoué avec le code ${code}. Erreur système: ${errorOutput}`);
      }

      console.log(`\n✅ Commande Docker Compose exécutée avec succès\n`);
    } else {
      // Mode détaché : ajouter "-d" uniquement pour la commande "up"
      if (commandOptions.up && !dockerComposeCommand.includes("-d")) {
        dockerComposeCommand.push("-d");
      }
      console.log(`\nExécution en mode détaché de la commande Docker Compose: ${dockerComposeCommand.join(" ")}`);
      const cmd = new Deno.Command(dockerComposeCommand[0], {
        args: dockerComposeCommand.slice(1),
        env: envVars,
        stdout: "inherit",
        stderr: "inherit",
      });
      // Lancer le processus en arrière-plan sans attendre sa fin
      cmd.spawn();
      return;  // Libère immédiatement le terminal
    }
  } catch (error) {
    if (!retry && error.message.includes("network") && error.message.includes("in use by task")) {
      console.log("Conflit de réseau détecté. Exécution du nettoyage automatique...");
      const problematicNetworkId = "9p1lxam3fc3d2yma4kszw2t3f"; // Ajustez si nécessaire
      await Soluce_Docker_Network(problematicNetworkId)
      await automateDockerNetworkCleanup(problematicNetworkId);
      console.log("Réessai de l'exécution de Docker Compose après correction...");
      return await runDockerCompose(commandOptions, serviceInfo, envVars, true);
    } else {
      console.error("Erreur lors de l'exécution de Docker Compose:", error.message);
      throw error;
    }
  }
}




// ------------------------------------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------------------------------------

// Déclaration globale de svc n'est pas recommandée.
// Initialisez svc dans la fonction main et passez-le comme argument aux fonctions nécessaires.

async function main() {
  try {
    const { dockerCmd } = parseCommand(Deno.args);

    if (!dockerCmd.detached) { 
      console.log(bold(yellow(
        "Appuyez sur 'x' puis Entrée pour détacher le processus et libérer le terminal,\n" +
        "ou appuyez simplement sur Entrée pour continuer en mode interactif."
      )));
    } 

    const svc = await parsePath(Deno.args, dockerCmd.detached);
    const envVars = await loadEnvFiles(svc, dockerCmd.detached);
    await runDockerCompose(dockerCmd, svc, envVars);

  } catch (error) {
    console.error("Erreur:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      await logError(error);
    } else {
      await logError(new Error(String(error)));
    }
  } finally {
    Deno.exit();
  }
}

if (import.meta.main) {
  main();
}
