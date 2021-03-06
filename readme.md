# Listener for deduplication system

Listens changes in Aleph by polling oracle tables. Saves any changed records to the datastore and triggers duplicate checks for them.

Listener is a component in the larger Aleph record deduplication system. See documentation in [melinda-deduplication-common](https://github.com/NatLibFi/melinda-deduplication-common) for an overview of the system.

## Installation

This system requires oracle connections. Check instructions for installing [node-oracledb](https://github.com/oracle/node-oracledb).

Installation in short:

Oracle instantclient installed into /opt/instantclient_12_2
```
export OCI_LIB_DIR=/opt/instantclient_12_2
export OCI_INC_DIR=/opt/instantclient_12_2/sdk/include

npm install

```

Build the application: 
```
npm run build 
```

Intall dependences for the built application:
```
cd build
npm install --prod
```

The build result will be in `build/` directory and is runnable from there. For example:
```
node build/index.js
```


## Running

The tnsnames.ora file must be used for connection. This can be done with TNS_ADMIN environment variable.

Example, assuming that tnsnames.ora is in `pwd`:
```
TNS_ADMIN=`pwd` LD_LIBRARY_PATH=/opt/instantclient_12_2/ node index.js
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
