FROM --platform=$BUILDPLATFORM node:latest
WORKDIR /bin
ADD ./ /bin
RUN npm install /bin
ENTRYPOINT ["node", "/bin/run.js"]
