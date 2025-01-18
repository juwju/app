import { exec } from "https://deno.land/x/exec/mod.ts";
import { parse } from "https://deno.land/std@0.114.0/flags/mod.ts";

const SSH_BASE_CMD = "ssh -q";

// Run a command over SSH
async function runRemoteCommand(server: string, command: string) {
  console.log(`Connecting to ${server} and running: ${command}`);
  const fullCommand = `${SSH_BASE_CMD} ${server} \"${command}\"`;
  const result = await exec(fullCommand);
  return result.output.trim();
}

// Initialize a Docker Swarm node
async function initSwarm(server: string, advertiseAddr: string) {
  const command = `docker swarm init --advertise-addr ${advertiseAddr}`;
  const output = await runRemoteCommand(server, command);
  console.log(output);
}

// Add a manager to the swarm
async function addManager(managerServer: string, targetServer: string) {
  const getTokenCmd = `docker swarm join-token manager -q`;
  const token = await runRemoteCommand(managerServer, getTokenCmd);
  const managerIP = await runRemoteCommand(managerServer, "hostname -I | awk '{print $1}'");
  const joinCommand = `docker swarm join --token ${token} ${managerIP}:2377`;
  const output = await runRemoteCommand(targetServer, joinCommand);
  console.log(output);
}

// Add a worker to the swarm
async function addWorker(managerServer: string, targetServer: string) {
  const getTokenCmd = `docker swarm join-token worker -q`;
  const token = await runRemoteCommand(managerServer, getTokenCmd);
  const managerIP = await runRemoteCommand(managerServer, "hostname -I | awk '{print $1}'");
  const joinCommand = `docker swarm join --token ${token} ${managerIP}:2377`;
  const output = await runRemoteCommand(targetServer, joinCommand);
  console.log(output);
}

// Main logic
const args = parse(Deno.args);
const task = args._[0];
const server = args.server as string;
const targetServer = args.targetServer as string;

if (!task || !server) {
  console.error("Usage: deno task <task> --server=<server> [--targetServer=<targetServer>]");
  Deno.exit(1);
}

(async () => {
  switch (task) {
    case "init":
      if (!args.advertiseAddr) {
        console.error("Usage: deno task init --server=<server> --advertiseAddr=<IP>");
        Deno.exit(1);
      }
      await initSwarm(server, args.advertiseAddr as string);
      break;
    case "addmanager":
      if (!targetServer) {
        console.error("Usage: deno task addmanager --server=<managerServer> --targetServer=<targetServer>");
        Deno.exit(1);
      }
      await addManager(server, targetServer);
      break;
    case "addworker":
      if (!targetServer) {
        console.error("Usage: deno task addworker --server=<managerServer> --targetServer=<targetServer>");
        Deno.exit(1);
      }
      await addWorker(server, targetServer);
      break;
    default:
      console.error("Unknown task. Supported tasks: init, addmanager, addworker");
      Deno.exit(1);
  }
})();
