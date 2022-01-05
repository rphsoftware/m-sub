# m-sub
Converts videos to mkv files with the entire video stream as subtitles.

## !! NOTE: ONLY WORKS ON LINUX !!
## NOTE: Unless you enable `nodeMode` in `scripts/psub.js`, you will need to have `zopfli` installed and in your PATH.

### Requirements:
- `node` and `npm` installed and on relatively modern versions
- `zopfli` if you don't want to use nodeMode
- `ffmpeg` for intermediate steps


### Operation:
- The first time, run `./build.sh` to build the necessary rust dependency *and* install the necessary node.js modules.
- Afterwards, run `./create.sh <input> <output>` to convert the videos.
- You might want to run `./clean.sh` to clean up residual data present in the scripts directory to save on disk space.

