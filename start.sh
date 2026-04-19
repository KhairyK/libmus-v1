#!/usr/bin/env bash
set -e

node worker.js &
exec node server.js
