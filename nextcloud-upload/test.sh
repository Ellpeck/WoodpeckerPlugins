export PLUGIN_SERVER=https://cloud.ellpeck.de
export PLUGIN_USER=EllBot
export PLUGIN_FILES=**/*.md
export PLUGIN_DEST=Uploads/$(date '+%M:%S')
export PLUGIN_RETENTIONBASE=Uploads
export PLUGIN_RETENTIONAMOUNT=3
export PLUGIN_RETENTIONSKIPTRASH=true

npm install
node run.js
