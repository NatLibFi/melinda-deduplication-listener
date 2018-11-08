#!/bin/bash
for ENV in $(cat env);do
  export $ENV
done

./setup-oracle.sh &&
docker run \
  -d \
  --rm \
  --name mcia-mq \
  -p 1339:5672 \
  rabbitmq &&
LD_LIBRARY_PATH=instantclient_12_2 node dist/index.js
docker rm -f mcia-mq
