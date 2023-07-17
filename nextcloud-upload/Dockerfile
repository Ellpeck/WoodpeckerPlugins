FROM --platform=$BUILDPLATFORM node:latest
WORKDIR /bin
ADD . /bin
RUN npm install
ENTRYPOINT ["node", "run.js"]
