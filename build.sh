#!/bin/sh
# This script just builds the rust program and puts it in the correct spot, to avoid distributing binaries.

cd video-to-subtitle
cargo build --release
cp target/release/video-to-subtitle ../scripts/v2s

echo "Done!"