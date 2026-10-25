#!/bin/bash
# Izgradnja APK-a i AAB-a u WSL-u (korisnik dino).
# Pokretanje iz Windowsa:  wsl -d Ubuntu-22.04 -- bash "/mnt/c/.../radne-nedjelje/android/izgradi.sh"
set -e
IZVOR="$(cd "$(dirname "$0")/.." && pwd)"     # .../radne-nedjelje (na Windows disku)
RADNO="$HOME/radne-nedjelje-build"
export ANDROID_HOME="$HOME/android-sdk"
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(which javac)")")")"
GRADLE_VER=8.14.3
GRADLE="$HOME/gradle-$GRADLE_VER/bin/gradle"

if [ ! -x "$GRADLE" ]; then
  echo "Preuzimam Gradle $GRADLE_VER ..."
  wget -q "https://services.gradle.org/distributions/gradle-$GRADLE_VER-bin.zip" -O /tmp/gradle.zip
  unzip -q -o /tmp/gradle.zip -d "$HOME" && rm /tmp/gradle.zip
fi

mkdir -p "$RADNO"
rsync -a --delete --exclude build --exclude .gradle "$IZVOR/android/" "$RADNO/android/"
rsync -a --delete "$IZVOR/docs/" "$RADNO/docs/"
echo "sdk.dir=$ANDROID_HOME" > "$RADNO/android/local.properties"

cd "$RADNO/android"
"$GRADLE" --no-daemon -q assembleRelease bundleRelease

mkdir -p "$IZVOR/izlaz"
VER=$(grep -oP "versionName '\K[^']+" app/build.gradle)
cp app/build/outputs/apk/release/app-release.apk "$IZVOR/izlaz/radne-nedjelje-$VER.apk"
cp app/build/outputs/bundle/release/app-release.aab "$IZVOR/izlaz/radne-nedjelje-$VER.aab"
ls -la "$IZVOR/izlaz"
echo GOTOVO
