#!/usr/bin/env bash
cd dist
node --max_old_space_size=8000 server.js | tee -a ../div/console.log

