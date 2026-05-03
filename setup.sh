#!/usr/bin/env bash
# MyTeamBrain Setup Wrapper
# Delegates to node scripts/setup.js for unified installation
#
#  ██████╗ ██████╗ ███████╗███╗   ██╗██╗    ██╗███╗   ██╗██╗   ██╗
#  ██╔════╝██╔═══██╗██╔════╝████╗  ██║██║     ██║████╗  ██║██║   ██║
#  ██║     ██║   ██║███████╗██╔██╗ ██║██║     ██║██╔██╗ ██║██║   ██║
#  ██║     ██║   ██║╚════██║██║╚██╗██║██║     ██║██║╚██╗██║██║   ██║
#  ╚██████╗╚██████╔╝███████║██║ ╚████║███████╗██║██║ ╚████║╚██████╔╝
#   ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETUP_JS="$SCRIPT_DIR/scripts/setup.js"

if [ ! -f "$SETUP_JS" ]; then
    echo "Error: setup.js not found at $SETUP_JS"
    exit 1
fi

# Delegate to Node.js setup script
exec node "$SETUP_JS" "$@"