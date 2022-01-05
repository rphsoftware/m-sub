const { execSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const { deflateSync } = require('zlib');
const frame = process.argv[2];
const fid = parseInt(process.argv[3]);
const oc = process.argv[4];

let nodeMode = true;

execSync(`${oc}/v2s i ${oc}/frames/${frame} ${fid * 2} ${oc}/subs/${fid}.ass`);

let f = readFileSync(`${oc}/subs/${fid}.ass`, "utf-8");
execSync(`rm ${oc}/subs/${fid}.ass`);

f = f.split("\n");

if (nodeMode) {
	writeFileSync(`${oc}/subs/${fid}_0.ass.zlib`, deflateSync(Buffer.from(f[0])));
	writeFileSync(`${oc}/subs/${fid}_1.ass.zlib`, deflateSync(Buffer.from(f[1])));
} else {

	writeFileSync(`${oc}/subs/${fid}_0.ass`, f[0]);
	writeFileSync(`${oc}/subs/${fid}_1.ass`, f[1]);

//writeFileSync(`${oc}/subs/${fid}_0.ass.zlib`, deflateSync(Buffer.from(f[0])));
//writeFileSync(`${oc}/subs/${fid}_1.ass.zlib`, deflateSync(Buffer.from(f[1])));

	execSync(`zopfli --i15 --zlib ${oc}/subs/${fid}_0.ass`);
	execSync(`zopfli --i15 --zlib ${oc}/subs/${fid}_1.ass`);
//execSync(`zlib-flate -compress < ${oc}/subs/${fid}_0.ass > ${oc}/subs/${fid}_0.ass.zlib`);
//execSync(`zlib-flate -compress < ${oc}/subs/${fid}_1.ass > ${oc}/subs/${fid}_1.ass.zlib`);
	execSync(`rm ${oc}/subs/${fid}_0.ass`);
	execSync(`rm ${oc}/subs/${fid}_1.ass`);
}