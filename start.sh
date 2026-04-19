#!/usr/bin/env bash
set -e

node lib/worker.js &
exec node server.js
