#!/bin/bash
cp "$1" scripts/input_file
cd scripts
node prep_video.js input_file
node alter_file.js
node unfucker.js
node writer_b.js
cd ..
cp scripts/base_3.processed.mkv "$2"