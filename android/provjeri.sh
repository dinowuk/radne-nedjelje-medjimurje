#!/bin/bash
# Provjera izgrađenog APK-a: potpis, ugrađene datoteke, paket i SDK verzije.
APK="$(cd "$(dirname "$0")/.." && pwd)/izlaz/radne-nedjelje-${1:-1.0}.apk"
BT="$HOME/android-sdk/build-tools/36.0.0"
"$BT/apksigner" verify --print-certs "$APK" | head -2
unzip -l "$APK" | awk '{print $4}' | grep 'assets/www'
"$BT/aapt2" dump badging "$APK" | grep -E "^package|sdkVersion|targetSdkVersion|application-label:"
