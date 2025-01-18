// Fonction pour exécuter une commande shell
async function execCommand(command: string[], options: Deno.CommandOptions = {}): Promise<string> {
    const cmd = new Deno.Command(command[0], {
      args: command.slice(1),
      ...options,
    });
  
    const { code, stdout, stderr } = await cmd.output();
    
    if (code !== 0) {
      const errorOutput = new TextDecoder().decode(stderr);
      throw new Error(`Commande échouée avec le code ${code}: ${errorOutput}`);
    }
  
    return new TextDecoder().decode(stdout);
  }
  
  async function updateDeno() {
    try {
      console.log("🔍 Vérification des permissions...");
      
      // Vérifier si on est en root
      const isRoot = Deno.uid() === 0;
      if (!isRoot) {
        console.log("⚠️  Ce script doit être exécuté en tant que root");
        Deno.exit(1);
      }
  
      console.log("📦 Téléchargement de la dernière version de Deno...");
      
      // Créer un dossier temporaire
      const tempDir = await Deno.makeTempDir({ prefix: "deno_update_" });
      
      // Télécharger la dernière version
      await execCommand([
        "curl",
        "-fsSL",
        "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip",
        "-o",
        `${tempDir}/deno.zip`
      ]);
  
      console.log("📂 Décompression de l'archive...");
      await execCommand(["unzip", "-o", `${tempDir}/deno.zip`, "-d", "/usr/local/bin/"]);
  
      console.log("🔑 Configuration des permissions...");
      await execCommand(["chmod", "755", "/usr/local/bin/deno"]);
  
      console.log("🧹 Nettoyage...");
      await Deno.remove(tempDir, { recursive: true });
  
      // Vérifier la nouvelle version
      const version = await execCommand(["deno", "--version"]);
      console.log("✅ Mise à jour terminée!");
      console.log("📌 Version installée:");
      console.log(version);
  
    } catch (error) {
      console.error("❌ Erreur lors de la mise à jour:", error.message);
      Deno.exit(1);
    }
  }
  
  if (import.meta.main) {
    updateDeno();
  }