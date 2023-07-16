export PLUGIN_SERVER=https://cloud.ellpeck.de
export PLUGIN_USER=EllBot
export PLUGIN_FILES=**/*.md
export PLUGIN_DEST=Uploads/$(date '+%M:%S')
export PLUGIN_RETENTION_BASE=Uploads
export PLUGIN_RETENTION_AMOUNT=3

npm install
node run.js
