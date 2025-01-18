async function checkVolumeExists(volumeName: string): Promise<boolean> {
  try {
    const checkVolume = new Deno.Command("docker", {
      args: ["volume", "ls", "-q", "-f", `name=^${volumeName}$`]
    });
    const output = await checkVolume.output();
    const volumeList = new TextDecoder().decode(output.stdout).trim();
    return volumeList.length > 0;
  } catch (error) {
    console.error(`⚠️ Erreur lors de la vérification du volume: ${error}`);
    return false;
  }
}

async function findNextAvailableVolumeName(baseName: string): Promise<string> {
  let counter = 1;
  let volumeName = baseName;
  
  while (await checkVolumeExists(volumeName)) {
    volumeName = `${baseName}_${counter}`;
    counter++;
  }
  
  return volumeName;
}

async function promptUser(question: string): Promise<string> {
  const buf = new Uint8Array(1024);
  await Deno.stdout.write(new TextEncoder().encode(question));
  const n = await Deno.stdin.read(buf);
  if (n === null) return "";
  return new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
}

async function handleExistingVolume(volumeName: string): Promise<string | null> {
  console.log(`\n⚠️ Le volume "${volumeName}" existe déjà!`);
  console.log(`
Choisissez une option:
1) Annuler l'opération
2) Remplacer le volume existant
3) Créer un nouveau volume avec un suffixe numérique
`);

  const response = await promptUser("Votre choix (1-3): ");

  switch (response) {
    case "1":
      console.log("❌ Opération annulée");
      return null;
    case "2":
      console.log(`🗑️ Suppression du volume existant "${volumeName}"...`);
      try {
        const removeVolume = new Deno.Command("docker", {
          args: ["volume", "rm", volumeName]
        });
        await removeVolume.output();
        console.log("✅ Volume existant supprimé");
        return volumeName;
      } catch (error) {
        console.error(`❌ Erreur lors de la suppression du volume: ${error}`);
        return null;
      }
    case "3":
      const newVolumeName = await findNextAvailableVolumeName(volumeName);
      console.log(`✨ Utilisation du nouveau nom: ${newVolumeName}`);
      return newVolumeName;
    default:
      console.log("❌ Option invalide, opération annulée");
      return null;
  }
}

async function migrateHostPathToDockerVolume(
  sourceHostPath: string, 
  targetVolumeName: string
): Promise<boolean> {
  try {
    const TEMP_CONTAINER_NAME = "migration-temp-container";
    const CONTAINER_MOUNT_PATH = "/destination";
    const DEFAULT_USER_GROUP = "1000:1000";

    console.log(`🚀 Démarrage de la migration de ${sourceHostPath} vers le volume ${targetVolumeName}...`);

    // Vérifier si le volume existe
    if (await checkVolumeExists(targetVolumeName)) {
      const newVolumeName = await handleExistingVolume(targetVolumeName);
      if (newVolumeName === null) {
        return false;
      }
      targetVolumeName = newVolumeName;
    }

    // Initialiser le conteneur temporaire avec le volume
    console.log(`📦 Création du conteneur temporaire ${TEMP_CONTAINER_NAME}...`);
    const initContainer = new Deno.Command("docker", {
      args: [
        "run",
        "-d",
        "--name", TEMP_CONTAINER_NAME,
        "-v", `${targetVolumeName}:${CONTAINER_MOUNT_PATH}`,
        "alpine",
        "tail", "-f", "/dev/null"
      ]
    });
    await initContainer.output();
    console.log(`✅ Conteneur temporaire créé avec succès`);

    // Migrer les données vers le volume
    console.log(`📋 Copie des données en cours...`);
    const migrateData = new Deno.Command("docker", {
      args: [
        "cp",
        `${sourceHostPath}/.`,
        `${TEMP_CONTAINER_NAME}:${CONTAINER_MOUNT_PATH}/`
      ]
    });
    await migrateData.output();
    console.log(`✅ Données copiées avec succès`);

    // Configurer les permissions
    console.log(`🔒 Configuration des permissions...`);
    const setPermissions = new Deno.Command("docker", {
      args: [
        "exec",
        TEMP_CONTAINER_NAME,
        "chown",
        "-R",
        DEFAULT_USER_GROUP,
        CONTAINER_MOUNT_PATH
      ]
    });
    await setPermissions.output();
    console.log(`✅ Permissions configurées avec succès`);

    // Supprimer le conteneur temporaire
    console.log(`🧹 Nettoyage du conteneur temporaire...`);
    const removeContainer = new Deno.Command("docker", {
      args: [
        "rm",
        "-f",
        TEMP_CONTAINER_NAME
      ]
    });
    await removeContainer.output();
    console.log(`✅ Conteneur temporaire supprimé`);

    console.log(`\n✨ Migration réussie vers le volume Docker ${targetVolumeName}`);
    return true;
  } catch (error) {
    console.error(`\n❌ Erreur lors de la migration vers le volume Docker:`);
    console.error(`   ${error}`);
    
    // Tentative de nettoyage en cas d'erreur
    try {
      console.log(`🧹 Tentative de nettoyage du conteneur temporaire...`);
      const cleanup = new Deno.Command("docker", {
        args: ["rm", "-f", "migration-temp-container"]
      });
      await cleanup.output();
      console.log(`✅ Nettoyage effectué`);
    } catch (cleanupError) {
      console.error(`⚠️ Impossible de nettoyer le conteneur temporaire: ${cleanupError}`);
    }
    
    return false;
  }
}

// Récupérer les arguments de la ligne de commande
const args = Deno.args;

if (args.length !== 2) {
  console.error(`
❌ Erreur: Nombre incorrect d'arguments
📘 Usage: deno task cvtvol <chemin_source> <nom_volume>
📝 Example: deno task cvtvol ./mon_dossier mon_volume
  `);
  Deno.exit(1);
}

const sourcePath = args[0];
const volumeName = args[1];

// Exécuter la migration
await migrateHostPathToDockerVolume(sourcePath, volumeName);