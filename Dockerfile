FROM node:8-alpine
WORKDIR app
CMD ["./setup-oracle.sh", node", "index.js"]

ENV LD_LIBRARY_PATH "/app/instantclient_12_2/:${LD_LIBRARY_PATH}"
ENV TNS_ADMIN /app
ENV OCI_LIB_DIR /app/instantclient_12_2
OCI_INC_DIR /app/instantclient_12_2/sdk/include

RUN chown -R node:node /app

ADD --chown=node:node dist .
ADD --chown=node:node package.json  .

RUN apk add -U --no-cache --virtual .build-deps git sudo python \
  && sudo -u node sh -c npm install --prod && npm cache clean --force' \
  && apk del .build-deps \
  && rm -rf /tmp/* /var/tmp/*

USER node
