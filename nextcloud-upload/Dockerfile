FROM --platform=$BUILDPLATFORM node:latest
ADD nextcloud-upload /bin
WORKDIR /bin
RUN npm install
ENTRYPOINT ["node", "/bin/run.js"]
