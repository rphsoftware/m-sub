const { execSync, exec } = require('child_process');
const { readdirSync } = require('fs');
const { cpus } = require('os');

execSync("rm -rf frames");
execSync("rm -rf subs");
execSync("mkdir frames");

let output = execSync(`ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 "${process.argv[2]}"`).toString('utf-8');
let w = output.split("width=")[1].split("\n")[0];
let h = output.split("height=")[1].split("\n")[0];
execSync(`ffmpeg -y -i "${process.argv[2]}" -vf fps=fps=25 frames/%09d.png`);
execSync(`ffmpeg -y -i "${process.argv[2]}" -vf "drawbox=x=0:y=0:w=(iw):h=(ih):color=black@1:t=fill" -c:a copy -c:v libx264 -preset veryfast -crf 60 -pix_fmt yuv420p base.mkv`);
execSync(`node parser.js base`);

execSync("mkdir subs");
execSync("./v2s h " + Math.ceil(parseInt(w) / 4) + " " + Math.ceil((parseInt(h) / 4)) + " > subs/head.ass");
//execSync("zopfli --i15 --zlib subs/head.ass");
//execSync("rm subs/head.ass");
let frames = readdirSync("frames");

function runPsubTask(command) {
    let m = Math.random();
    execSync(`mkdir -p /tmp/psub/${m}`);
    return new Promise(resolve => {
        exec(command, {
            cwd: `/tmp/psub/${m}`
        }, (error, stdout, stderr) => {
            execSync(`rm -rf /tmp/psub/${m}`);
            resolve();
        });
    });
}

let queue = [];

for (let frame of frames) {
    let fid = parseInt(frame.split(".")[0]) - 1;
    queue.push(`node "${process.cwd()}/psub.js" ${frame} ${fid} "${process.cwd()}"`);
}
let done = 0;
async function singularTask() {
    while(queue.length > 0) {
        let t = queue.shift();
        await runPsubTask(t);
        done++;
        console.log(`${done}/${frames.length}`);
    }
}


(async () => {
    await new Promise(r => setTimeout(r, 3000));

    let promises = [];
    for (let i = 0; i < cpus().length; i++) {
        promises.push(singularTask());
    }

    await Promise.all(promises);
})();