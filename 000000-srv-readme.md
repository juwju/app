## Procédure d'Installation Docker Swarm avec WireGuard et GlusterFS

### 1. Préparation du Système (sur chaque nœud)

#### Configuration sysctl.conf
```bash
sudo nano /etc/sysctl.conf
net.ipv4.conf.default.rp_filter=0
net.ipv4.conf.all.rp_filter=0

net.ipv4.tcp_syncookies=1

net.ipv4.ip_forward=1

net.ipv6.conf.all.forwarding=1
net.ipv6.conf.default.forwarding=1

net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0

sudo sysctl -p
```


#### Ouverture de Ports requise
  Pour Docker Swarm
```bash
# Ports Docker Swarm (via interface WireGuard)
sudo ufw allow in on wg0 to any port 2377 proto tcp
sudo ufw allow in on wg0 to any port 7946 proto tcp
sudo ufw allow in on wg0 to any port 7946 proto udp
sudo ufw allow in on wg0 to any port 4789 proto udp
```

#### Pour GlusterFS
Pour un environnement Docker Swarm, il est préférable d'installer GlusterFS sur les hôtes et d'utiliser le client GlusterFS pour monter les volumes dans les conteneurs6. Cette approche permet :
Une meilleure isolation du stockage
Une configuration réseau dédiée pour la réplication
L'utilisation de bind mounts pour les services6

```bash
# Ports GlusterFS (via interface WireGuard)
sudo ufw allow in on wg0 to any port 24007 proto tcp
sudo ufw allow in on wg0 to any port 24008 proto tcp
sudo ufw allow in on wg0 to any port 49152:49251 proto tcp
```

#### Pour WireGuard
Voir Readme de la Cie


### 2. Installation de GlusterFS (sur chaque nœud)

```bash
sudo apt update
sudo apt install glusterfs-server software-properties-common --no-install-recommends
sudo systemctl enable --now glusterd
sudo sudo apt install glusterfs-cli

# Configuration des hôtes
sudo nano /etc/hosts
# Ajoutez les IP et noms de tous les nœuds

# IP publique du master
203.161.46.164 juwju.com

# IP Hote Docker Swarm des nœuds
10.1.1.1 srvdkr-1
10.1.2.1 srvdkr-2
10.1.3.1 srvdkr-3
10.1.4.1 srvdkr-4

# IP Hote WireGuard des nœuds
10.2.1.1 srvwgd-1
10.2.2.1 srvwgd-2
10.2.3.1 srvwgd-3
10.2.4.1 srvwgd-4
```

### 3. Configuration du Cluster GlusterFS (depuis un nœud)

```bash
# Création des clusters à partir du premier cluster
gluster peer probe srvdkr-2
gluster peer probe srvdkr-3
gluster peer probe srvdkr-4

# Vérifier le statut
gluster peer status

# Créer le volume gv0 avec réplication
gluster volume create gv0 replica 3 \
  srvdkr-1:/data/brick1/gv0 \
  srvdkr-2:/data/brick1/gv0 \
  srvdkr-3:/data/brick1/gv0 \
  srvdkr-4:/data/brick1/gv0 force

# Démarrer le volume
gluster volume start gv0
```


### 4. Installation du Plugin Docker GlusterFS (sur chaque nœud)

```bash
docker plugin install --alias glusterfs trajano/glusterfs-volume-plugin \
  --grant-all-permissions \
  --disable
docker plugin set glusterfs SERVERS=node1,node2,node3
docker plugin enable glusterfs
```

### 5. Configuration Docker Swarm (sur le premier nœud)

```bash
# Initialisation du Swarm
docker swarm init --advertise-addr <IP_DU_NOEUD>

# Sauvegarder le token affiché pour joindre les autres nœuds
docker swarm join-token worker
```

### 6. Configuration du Réseau Docker (sur le premier nœud)

```bash
# Création du réseau overlay
docker network create \
  --driver overlay \
  --subnet 10.${APP_ID}.${SERVICE_ID}.0/24 \
  --attachable \
  custom_network
```

### 7. Configuration des Pare-feu (sur chaque nœud)

```bash
# Pour GlusterFS
sudo ufw allow 24007/tcp
sudo ufw allow 24008/tcp
sudo ufw allow 49152-49251/tcp

# Pour Docker Swarm
sudo ufw allow 2377/tcp
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp

# Pour WireGuard
sudo ufw allow 51820/udp
```

### 8. Joindre le Swarm (sur les autres nœuds)

```bash
docker swarm join --token <TOKEN> <IP_PREMIER_NOEUD>:2377
```

### 9. Vérification

```bash
# Sur n'importe quel nœud
docker node ls
docker network ls
gluster pool list
gluster volume status
```

Cette configuration permet d'avoir un cluster Docker Swarm hautement disponible avec stockage distribué via GlusterFS et communications sécurisées via WireGuard.

Citations:
[1] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/12467539/2c9e4bd5-49c7-4eef-af8a-1f31222f4fe9/paste.txt