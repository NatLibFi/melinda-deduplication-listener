#!/bin/bash
set -ex
ACBUILD_CMD="acbuild --no-history"

if [ -z $ACBUILD_ENGINE ];then
  ACBUILD_ENGINE="systemd-nspawn"
fi

ACI_OS="linux"
ACI_ARCH="amd64"
ACI_RELEASE="xenial"
ACI_NAME_DOMAIN="appc.cont-registry-kk.lib.helsinki.fi"
ACI_NAME_GROUP="melinda"
ACI_NAME="deduplication-listener-ubuntu"
ACI_VERSION="1.0.0"

rm -rf aci-build && mkdir aci-build &&
npm install --ignore-scripts && 
npm run build && cp -rp build aci-build/app &&

cat <<EOF > aci-build/nodesource.list
deb https://deb.nodesource.com/node_7.x xenial main
deb-src https://deb.nodesource.com/node_7.x xenial main
EOF

cat <<EOF > aci-build/nodesource.pref
Explanation: apt: nodesource
Package: nodejs
Pin: release a=nodesource
Pin-Priority: 1000
EOF

$ACBUILD_CMD begin docker://ubuntu:xenial

$ACBUILD_CMD set-name "$ACI_NAME_DOMAIN/$ACI_NAME_GROUP/$ACI_NAME"
$ACBUILD_CMD label add version $ACI_VERSION
$ACBUILD_CMD label add os $ACI_OS
$ACBUILD_CMD label add arch $ACI_ARCH
$ACBUILD_CMD label add release $ACI_RELEASE

$ACBUILD_CMD environment add TNS_ADMIN /opt/melinda-deduplication-listener/app
$ACBUILD_CMD environment add LD_LIBRARY_PATH /opt/oracle-instantclient

$ACBUILD_CMD set-working-directory /opt/melinda-deduplication-listener/app
$ACBUILD_CMD set-event-handler pre-start -- /bin/bash -c 'echo "127.0.0.1 $(hostname)" > /etc/hosts && cp tnsnames.ora.template tnsnames.ora && sed -i -e "s/%/|/g" -e "s/|HOST|/$HOST/g" -e "s/|SID|/$SID/g" -e "s/|PORT|/$PORT/g" tnsnames.ora'

$ACBUILD_CMD set-exec -- /bin/bash -c '/usr/bin/node index.js 2>&1 | tee -a /opt/melinda-deduplication-listener/logs/melinda-deduplication-listener.log'

$ACBUILD_CMD mount add logs /opt/melinda-deduplication-listener/logs
$ACBUILD_CMD mount add data /opt/melinda-deduplication-listener/data
$ACBUILD_CMD mount add --read-only conf /opt/melinda-deduplication-listener/conf

$ACBUILD_CMD copy $ORACLE_FILES_DIR /opt/oracle-instantclient
$ACBUILD_CMD copy aci-build/app /opt/melinda-deduplication-listener/app

if [ $ACBUILD_ENGINE == 'chroot' ];then
  $ACBUILD_CMD run --engine chroot -- /bin/bash -c "echo '$(grep -m1 -E ^nameserver /etc/resolv.conf)' > /etc/resolv.conf"
fi

$ACBUILD_CMD run --engine $ACBUILD_ENGINE -- ln -fs /opt/oracle-instantclient/libclntsh.so.12.1 /opt/oracle-instantclient/libclntsh.so
$ACBUILD_CMD run --engine $ACBUILD_ENGINE -- /bin/bash -c 'apt-get -y update && apt-get -y install apt-transport-https curl git python make gcc g++ libaio1'
$ACBUILD_CMD run --engine $ACBUILD_ENGINE -- /bin/bash -c 'curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key | apt-key add -'

$ACBUILD_CMD copy aci-build/nodesource.list /etc/apt/sources.list.d/nodesource.list
$ACBUILD_CMD copy aci-build/nodesource.pref /etc/apt/preferences.d/nodesource.pref

$ACBUILD_CMD run --engine $ACBUILD_ENGINE -- /bin/bash -c 'apt-get -y update && apt-get -y install nodejs'
$ACBUILD_CMD run --engine $ACBUILD_ENGINE --working-dir /opt/melinda-deduplication-listener/app -- /bin/bash -c 'OCI_LIB_DIR=/opt/oracle-instantclient OCI_INC_DIR=/opt/oracle-instantclient/sdk/include npm install --production'
$ACBUILD_CMD run --engine $ACBUILD_ENGINE --working-dir /opt/melinda-deduplication-listener/app/melinda-deduplication-common -- /bin/bash -c 'OCI_LIB_DIR=/opt/oracle-instantclient OCI_INC_DIR=/opt/oracle-instantclient/sdk/include npm install --production'

$ACBUILD_CMD run --engine $ACBUILD_ENGINE -- /bin/bash -c 'apt-get -y update && apt-get -y install tzdata'
$ACBUILD_CMD run --engine $ACBUILD_ENGINE -- /bin/bash -c 'ln -fs /usr/share/zoneinfo/Europe/Helsinki /etc/localtime'

$ACBUILD_CMD port add http tcp 3001

if [ $ACBUILD_ENGINE == 'chroot' ];then
  $ACBUILD_CMD run --engine chroot -- rm /etc/resolv.conf
fi

$ACBUILD_CMD write "aci-build/$ACI_NAME_GROUP-$ACI_NAME-$ACI_RELEASE-$ACI_OS-$ACI_ARCH-$ACI_VERSION.aci"
$ACBUILD_CMD end

chmod og+rx aci-build
