### SETUP SERVER
sudo chgrp -R www-data /opt
sudo chmod -R 770 /opt
sudo chmod g+s /opt

sudo apt update
sudo apt upgrade


## pour chaque utilisateur (via sudo su)
sudo apt install zsh -y
chsh -s $(which zsh)
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"


# deno
sudo apt install unzip -y
cd /tmp
curl -Lo "deno.zip" "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip"
sudo unzip -d /usr/local/bin /tmp/deno.zip
deno --version

