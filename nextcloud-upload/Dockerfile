FROM --platform=$BUILDPLATFORM node:latest
ADD nextcloud-upload /bin
WORKDIR /bin
RUN npm install /bin
ENTRYPOINT ["node", "run.js"]
