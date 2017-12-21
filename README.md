# Listener microservice of Melinda deduplication system [![NPM Version](https://img.shields.io/npm/v/@natlibfi/melinda-deduplication-listener.svg)](https://npmjs.org/package/@natlibfi/melinda-deduplication-listener) [![Build Status](https://travis-ci.org/NatLibFi/melinda-deduplication-listener.svg)](https://travis-ci.org/NatLibFi/melinda-deduplication-listener)

Listener microservice of Melinda deduplication system. See [documentation(https://natlibfi.github.io/melinda-deduplication).

## Installation

This system requires oracle connections. Check instructions for installing [node-oracledb](https://github.com/oracle/node-oracledb).


_(Oracle instantclient installed into /opt/instantclient_12_2)_
```
OCI_LIB_DIR=/opt/instantclient_12_2 OCI_INC_DIR=/opt/instantclient_12_2/sdk/include npm install
npm run build
```

### Building a container image
([acbuild](https://github.com/containers/build) must be in PATH)
```
bin/build-aci.sh
```

## Running

The tnsnames.ora file must be used for connection. This can be done with TNS_ADMIN environment variable.

Example, assuming that tnsnames.ora is in `pwd`:
```
TNS_ADMIN=`pwd` LD_LIBRARY_PATH=/opt/instantclient_12_2/ bin/start
```

Example of tnsnames.ora 
```
$ cat tnsnames.ora 
ALEPH =
 (DESCRIPTION =
   (ADDRESS = (PROTOCOL = TCP)(HOST = localhost)(PORT = 1521))
   (CONNECT_DATA =
     (SID = ALEPH20)
   )
 )
```

For development use: `npm run dev`


### Configuration
The following environment variables are used to configure the system:

| name | mandatory | description | default |
|---|---|---|---|
| Z106_BASES | | Z106 bases for polling | FIN01 |
| Z115_BASE | | Z115 base for polling | USR00 |
| CURSOR_FILE | | file for saving the polling cursors | .aleph-changelistener-cursors.json |
| Z106_STASH_PREFIX | | file for saving intermediate info about Z106 | .z106_stash |
| POLL_INTERVAL_MS | | wait time between pollings | 5000 |
| ORACLE_USER | x | oracle username | -
| ORACLE_PASS | x | oracle password | -
| ORACLE_CONNECT_STRING | x | oracle connection string | -
| X_SERVER | x | Aleph X-server url | -
| MELINDA_API | | melinda api endpoint | http://libtest1.csc.fi:8992/API

Since the Z106 resolution is only 60 seconds in Aleph, the changes that have already been handled are saved so that nothing is handled multiple times.

The ORACLE_CONNECT_STRING must match the connection string in the tnsnames.ora file. With above tnsnames.ora it should be "ALEPH".

## License and copyright

Copyright (c) 2017 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **Apache License 2.0**.


