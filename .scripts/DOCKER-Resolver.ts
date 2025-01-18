





async function Docker_Network_IS_Swarm(networkId: string): Promise<boolean> {
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

  async function removeSwarmNetwork(networkName: string): Promise<void> {
    try {
      console.log(`Inspection du réseau ${networkName}...`);
      const inspectCmd = new Deno.Command("docker", {
        args: ["network", "inspect", networkName],
        stdout: "piped",
        stderr: "piped",
      });
  
      const { code, stdout, stderr } = await inspectCmd.output();
      if (code !== 0) {
        console.error("Erreur lors de l'inspection du réseau :", new TextDecoder().decode(stderr));
        return;
      }
  
      const networkInfo = JSON.parse(new TextDecoder().decode(stdout));
      const isSwarm = networkInfo[0]?.Scope === "swarm";
  
      if (!isSwarm) {
        console.log(`Le réseau ${networkName} n'est pas un réseau Swarm. Aucune action nécessaire.`);
        return;
      }
  
      console.log(`Le réseau ${networkName} est un réseau Swarm.`);
  
      // Lister les services liés au réseau
      console.log("Récupération des services liés au réseau...");
      const serviceCmd = new Deno.Command("docker", {
        args: ["service", "ls", "--filter", `network=${networkName}`, "--format", "{{.ID}}"],
        stdout: "piped",
      });
  
      const serviceOutput = await serviceCmd.output();
      const serviceList = new TextDecoder().decode(serviceOutput.stdout).trim().split("\n");
  
      if (serviceList.length > 0 && serviceList[0]) {
        console.log(`Services trouvés sur le réseau ${networkName} : ${serviceList.join(", ")}`);
        const confirmation = confirm("Voulez-vous forcer la suppression des services liés ? [y/n]");
        if (!confirmation) {
          console.log("Suppression annulée par l'utilisateur.");
          return;
        }
  
        // Supprimer les services liés
        for (const serviceId of serviceList) {
          if (serviceId) {
            console.log(`Suppression du service ${serviceId}...`);
            await new Deno.Command("docker", {
              args: ["service", "rm", serviceId],
            }).output();
          }
        }
      } else {
        console.log("Aucun service lié au réseau.");
      }
  
      // Supprimer le réseau
      console.log(`Suppression du réseau ${networkName}...`);
      const removeCmd = new Deno.Command("docker", {
        args: ["network", "rm", networkName],
      });
  
      const removeOutput = await removeCmd.output();
    if (removeOutput.code === 0) {
      console.log(`Le réseau ${networkName} a été supprimé avec succès.`);
    } else {
      console.error("Erreur lors de la suppression du réseau.");
    }
  } catch (error) {
    console.error("Erreur lors du traitement du réseau Swarm :", error.message);
  }
}

// Utilisation
await removeSwarmNetwork("juwju_networks");