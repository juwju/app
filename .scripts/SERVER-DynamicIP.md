# Auto-Update GoDaddy IP Setup Guide

This guide provides instructions on how to set up the DevreosNginx environment on an Ubuntu server. Follow these steps to copy the directory, configure the environment, and set up a cron job.

## Prerequisites

- A server running Ubuntu.
- Sudo privileges on the server.

## Step 1: Copy the DevreosNginx Directory

First, you need to copy the `DevreosNginx` directory to the appropriate location on your server. You can use `scp` or `rsync` if you're copying from a remote machine, or `cp` if you're doing it locally.

```bash
sudo setfacl -R -m u:$USER:rwx /opt/SERVER/DYN-IP
```

## Step 2: Ensure Correct Permissions

Set the correct permissions for the DevreosNginx directory to ensure that the scripts can execute properly.

```bash
sudo chown -R www-data:www-data /opt/SERVER/DYN-IP
sudo chmod -R 755 /opt/SERVER/DYN-IP
sudo setfacl -R -m u:$USER:rwx /opt/SERVER/DYN-IP
```

## Step 3: Install Required Packages

Ensure your server has curl and jq installed, as they are required by the scripts.

```bash
sudo apt update
sudo apt upgrade
sudo apt install curl jq
```

## Step 4: Configure Cron Job

Set up a cron job to run the script at regular intervals. Open the crontab editor:

```bash
sudo systemctl enable cron
sudo systemctl start cron
sudo systemctl status cron
sudo crontab -e
```

Add the following line to execute the script every 5 minutes:

```bash
*/5 * * * * /opt/SERVER/DYN-IP/Check_ip.sh
```

CTRL + o pour sauvegarder et CTRL + x pour quitter

## Step 5: Verify Cron Job

Confirm that the cron job has been added successfully:

```bash


sudo systemctl restart cron
sudo crontab -l
```

## Step 6 : Add Godaddy values to the .env file

Allez sur [https://developer.godaddy.com/](https://developer.godaddy.com/)
Créez une API KEY et un API SECRET
Copiez les valeurs dans le fichier .env
