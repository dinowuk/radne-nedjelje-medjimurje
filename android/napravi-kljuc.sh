#!/bin/bash
# Jednokratno: napravi ključ za potpisivanje (upload key za Google Play).
# BEZ OVOG KLJUČA NEMA NADOGRADNJI APLIKACIJE — čuvati kopiju na sigurnom mjestu.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)/kljuc"
if [ -f "$DIR/radne-nedjelje.jks" ]; then echo "Ključ već postoji: $DIR/radne-nedjelje.jks"; exit 0; fi
mkdir -p "$DIR"
LOZ=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
keytool -genkeypair -v -keystore "$DIR/radne-nedjelje.jks" -storetype PKCS12 -alias radne-nedjelje \
  -keyalg RSA -keysize 4096 -validity 10000 -storepass "$LOZ" -keypass "$LOZ" \
  -dname "CN=Radne nedjelje Medjimurje, O=dinowuk, C=HR" >/dev/null 2>&1
cat > "$DIR/kljuc.properties" <<EOF
storeFile=radne-nedjelje.jks
storePassword=$LOZ
keyAlias=radne-nedjelje
keyPassword=$LOZ
EOF
echo "Ključ napravljen: $DIR"
