#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_FILE="$HOME/.local/share/applications/orbit-todo.desktop"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-}"

if [ -z "$DESKTOP_DIR" ] && command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP_DIR="$(xdg-user-dir DESKTOP)"
fi

if [ -z "$DESKTOP_DIR" ]; then
  DESKTOP_DIR="$HOME/Desktop"
fi

mkdir -p "$(dirname "$APP_FILE")" "$DESKTOP_DIR"

cat > "$APP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=星轨清单
Comment=Orbit Todo desktop planner
Exec=$ROOT_DIR/run.sh
Icon=$ROOT_DIR/assets/orbit-todo.svg
Terminal=false
Categories=Utility;Office;
StartupNotify=true
EOF

chmod +x "$APP_FILE"
cp "$APP_FILE" "$DESKTOP_DIR/orbit-todo.desktop"
chmod +x "$DESKTOP_DIR/orbit-todo.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
fi

if command -v gio >/dev/null 2>&1; then
  gio set "$DESKTOP_DIR/orbit-todo.desktop" metadata::trusted true >/dev/null 2>&1 || true
fi

echo "Installed launcher:"
echo "  $APP_FILE"
echo "  $DESKTOP_DIR/orbit-todo.desktop"
