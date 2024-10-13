#!/bin/bash

sudo su
yum update -y

sudo yum install gcc jemalloc-devel openssl-devel tcl tcl-devel -y 
wget https://github.com/valkey-io/valkey/archive/refs/tags/7.2.7.tar.gz 
tar xvzf 7.2.7.tar.gz 
cd valkey-7.2.7/ 
make BUILD_TLS=yes install
