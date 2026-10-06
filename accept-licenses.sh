#!/usr/bin/env bash
set -eu

if command -v sdkmanager >/dev/null 2>&1; then
  sdkmanager_path="$(command -v sdkmanager)"
else
  sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
  if [[ -z "$sdk_root" ]]; then
    echo "Android SDK is not configured. Set ANDROID_SDK_ROOT or ANDROID_HOME." >&2
    exit 1
  fi

  sdkmanager_path="$sdk_root/cmdline-tools/latest/bin/sdkmanager"
  if [[ ! -x "$sdkmanager_path" ]]; then
    echo "sdkmanager not found at $sdkmanager_path." >&2
    exit 1
  fi
fi

yes | "$sdkmanager_path" --licenses
