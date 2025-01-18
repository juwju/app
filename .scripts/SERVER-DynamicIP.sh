#!/bin/bash

# Configuration des chemins
ENV_FILE="/opt/SERVER/Server.env"
SHELL_SCRIPT="/opt/SERVER/DYN-IP/Push_Ip.sh"
LOG_FILE="/opt/SERVER/LOGS/Dyn-IP.txt"

# Fonction pour ajouter des logs avec horodatage
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

# Charger les variables d'environnement
source $ENV_FILE

# Récupération de l'adresse IP publique actuelle
CURRENT_IP=$(curl -s https://api.ipify.org)

# Extraction de l'IP connue depuis le fichier .env
KNOWN_IP=$(grep '^CURRENT_IP=' $ENV_FILE | cut -d '=' -f2)

# Si l'IP a changé, mettre à jour le fichier .env et exécuter le script shell
if [ "$CURRENT_IP" != "$KNOWN_IP" ]; then
    # Mise à jour de l'adresse IP dans le fichier .env sans effacer les autres contenus
    sed -i "s/^CURRENT_IP=.*/CURRENT_IP=$CURRENT_IP/" $ENV_FILE
    log_message ""
    log_message "########################################################"
    log_message "Changement d'IP détecté. Nouvelle IP enregistrée dans .env: $CURRENT_IP"
    log_message "Mise à jour du DNS"
    bash $SHELL_SCRIPT
    log_message "Script shell secondaire exécuté."
else
    log_message "Aucun changement d'IP détecté."
fi


#!/bin/bash

# Configuration
ENV_PATH="/opt/SERVER/Server.env"
LOG_FILE="/opt/SERVER/LOGS/Dyn-IP.txt"

# Fonction pour ajouter des logs avec horodatage
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

# Chargement silencieux des variables d'environnement
set -a
source $ENV_PATH >/dev/null 2>&1
set +a

log_message "Chargement des variables d'environnement depuis $ENV_PATH"

# Vérification des variables d'environnement
if [ -z "$GODADDY_KEY" ] || [ -z "$GODADDY_SECRET" ] || [ -z "$ACTIVE_DOMAIN" ] || [ -z "$SERVER_NAME" ]; then
    log_message "Erreur: Une ou plusieurs variables d'environnement requises ne sont pas définies."
    echo "Erreur: Une ou plusieurs variables d'environnement requises ne sont pas définies."
    exit 1
fi

# Obtention de l'adresse IP publique
ip=$(curl -s https://api.ipify.org)
log_message "Adresse IP active : $ip"
echo "Adresse IP active: $ip"

# Mise à jour des enregistrements DNS
IFS=',' read -r -a domainList <<< "$ACTIVE_DOMAIN"
for domain in "${domainList[@]}"
do
    url="https://api.godaddy.com/v1/domains/$domain/records/A/$SERVER_NAME"
    data="[{\"type\":\"A\",\"name\":\"$SERVER_NAME\",\"data\":\"$ip\",\"ttl\":600}]"
    echo
    echo
    echo "################################################################################"
    echo "Requête transmise à GoDaddy pour $SERVER_NAME.$domain:"
    echo "URL: $url"
    echo "Données: $data"
    log_message "Requête transmise à GoDaddy pour $SERVER_NAME.$domain - URL: $url, Données: $data"

    response=$(curl -s -X PUT "$url" -H "Authorization: sso-key $GODADDY_KEY:$GODADDY_SECRET" -H "Content-Type: application/json" -d "$data")
    log_message "Réponse de mise à jour pour $SERVER_NAME.$domain: $response"
    echo "Réponse de mise à jour pour $SERVER_NAME.$domain: $response"

    if [[ "$response" == *"\"code\":\"INVALID_BODY\""* ]]; then
        echo "Échec: mise à jour DNS pour $SERVER_NAME.$domain avec réponse: $response"
        log_message "Échec: mise à jour DNS pour $SERVER_NAME.$domain avec réponse: $response"
    else
        echo "Succès: enregistrement DNS mis à jour pour $SERVER_NAME.$domain"
        log_message "Succès: enregistrement DNS mis à jour pour $SERVER_NAME.$domain"
        
        # Vérification de l'enregistrement DNS pour confirmer la mise à jour
        check_response=$(curl -s -X GET "$url" -H "Authorization: sso-key $GODADDY_KEY:$GODADDY_SECRET")
        check_ip=$(echo $check_response | jq -r '.[0].data')
        log_message "Réponse de vérification pour $SERVER_NAME.$domain: $check_response"
        if [ "$check_ip" == "$ip" ]; then
            echo "Validation réussie: IP $check_ip confirmée pour $SERVER_NAME.$domain"
            log_message "Validation réussie: IP $check_ip confirmée pour $SERVER_NAME.$domain"
        else
            echo "Validation échouée: IP attendue $ip, mais obtenue $check_ip pour $SERVER_NAME.$domain"
            log_message "Validation échouée: IP attendue $ip, mais obtenue $check_ip pour $SERVER_NAME.$domain"
        fi
    fi
done

log_message "Fin de la mise à jour des enregistrements DNS."





