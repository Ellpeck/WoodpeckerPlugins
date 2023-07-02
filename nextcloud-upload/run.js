const Upload = require("nextcloud-chunk-file-upload");
const glob = require("glob");
const axios = require("axios");

// parse arguments
const serverEnv = process.env.PLUGIN_SERVER;
if (!serverEnv)
    throw "Missing required arg server";
const userEnv = process.env.PLUGIN_USER;
if (!userEnv)
    throw "Missing required arg user";
const tokenEnv = process.env.PLUGIN_TOKEN;
if (!tokenEnv)
    throw "Missing required arg token";
const filesEnv = process.env.PLUGIN_FILES;
if (!filesEnv)
    throw "Missing required arg files";
const destEnv = process.env.PLUGIN_DEST;
if (!destEnv)
    throw "Missing required arg dest";

const baseDir = process.env.PLUGIN_BASEDIR || ".";
const chunkSizeEnv = process.env.PLUGIN_CHUNKSIZE || 50 * 1024 * 1024;
const quiet = process.env.PLUGIN_QUIET || false;

upload();

async function upload() {
    let basePath = `${serverEnv}/remote.php/dav`;
    const upload = new Upload(basePath, userEnv, userEnv, tokenEnv);
    for (let pattern of filesEnv.split(",")) {
        let files = await glob.glob(pattern, { cwd: baseDir });
        if (!files.length)
            console.log("No files to upload");
        for (let file of files) {
            let dest = `${destEnv}/${file}`;
            if (!quiet)
                console.log(`Uploading ${file} to ${dest}`);

            // we have to explicitly create any directories that don't exist yet
            // (https://github.com/shiftpi/nextcloud-chunk-file-upload/issues/22)
            let currDir = "";
            for (let dir of dest.split("/").slice(0, -1)) {
                currDir += `${dir}/`;
                try {
                    await axios.request({
                        method: 'mkcol',
                        url: `${basePath}/files/${userEnv}/${currDir}`,
                        auth: {
                            username: userEnv,
                            password: tokenEnv
                        }
                    });
                    if (!quiet)
                        console.log(`Created directory ${currDir}`);
                } catch (error) {
                    // this is fine since the directory likely already exists
                }
            }

            // use lib to upload file
            await upload.uploadFile(`${baseDir}/${file}`, dest, chunkSizeEnv).then(e => {
                if (!quiet)
                    console.log(`Uploaded ${file} to ${dest} (${e})`);
            }).catch(e => {
                console.log(`Failed to upload file ${file} to ${dest} (${e}, error ${e.httpErrorCode}, ${e.httpErrorMessage})`);
                process.exit(1);
            });
        }
    }
}
