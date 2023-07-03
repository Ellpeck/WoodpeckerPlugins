const Upload = require("nextcloud-chunk-file-upload");
const glob = require("glob");
const axios = require("axios");
const xml = require('xml2json');

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
const chunkSizeEnv = process.env.PLUGIN_CHUNKSIZE || 10 * 1024 * 1024;
const quiet = process.env.PLUGIN_QUIET || false;
const tags = process.env.PLUGIN_TAGS || "";

upload();

async function upload() {
    let basePath = `${serverEnv}/remote.php/dav`;

    // find ids for the tags we want to assign later
    let tagIds = new Map();
    if (tags) {
        if (!quiet)
            console.log(`Retrieving tag ids`);
        // list tags and find the ones we want: https://doc.owncloud.com/server/next/developer_manual/webdav_api/tags.html#list-tags
        let response = await axios.request({
            method: "propfind",
            url: `${basePath}/systemtags`,
            auth: {
                username: userEnv,
                password: tokenEnv
            },
            data: `<?xml version="1.0"?>
                <d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
                    <d:prop>
                        <oc:display-name/>
                        <oc:id/>
                    </d:prop>
                </d:propfind>`
        });
        var data = JSON.parse(xml.toJson(response.data))["d:multistatus"]["d:response"].map(e => e["d:propstat"]["d:prop"]);
        for (let tag of tags.split(",")) {
            let entry = data.find(e => e["oc:display-name"] == tag);
            if (!entry) {
                console.log(`Couldn't find tag with name ${tag}`);
                process.exit(1);
            }
            let tagId = entry["oc:id"];
            tagIds.set(tag, tagId);
            if (!quiet)
                console.log(`Tag id of tag ${tag} is ${tagId}`);
        }
    }

    // collect and upload files
    if (!quiet)
        console.log(`Uploading files`);
    let upload = new Upload(basePath, userEnv, userEnv, tokenEnv);
    for (let pattern of filesEnv.split(",")) {
        let files = await glob.glob(pattern, { cwd: baseDir });
        if (!files.length)
            console.log(`No files found for pattern ${pattern}`);
        for (let file of files) {
            let dest = `${destEnv}/${file}`;

            // we have to explicitly create any directories that don't exist yet
            // (https://github.com/shiftpi/nextcloud-chunk-file-upload/issues/22)
            let currDir = "";
            for (let dir of dest.split("/").slice(0, -1)) {
                currDir += `${dir}/`;
                try {
                    let response = await axios.request({
                        method: 'mkcol',
                        url: `${basePath}/files/${userEnv}/${currDir}`,
                        auth: {
                            username: userEnv,
                            password: tokenEnv
                        },
                        // 405 means the directory already exists
                        validateStatus: s => s == 201 || s == 405
                    });
                    if (response.status != 405 && !quiet)
                        console.log(`Created directory ${currDir}`);
                } catch (error) {
                    console.log(`Failed to create directory ${currDir} (${error})`);
                    process.exit(1);
                }
            }

            // use lib to upload file
            if (!quiet)
                console.log(`Uploading ${file} to ${dest}`);
            await upload.uploadFile(`${baseDir}/${file}`, dest, parseInt(chunkSizeEnv)).then(e => {
                if (!quiet)
                    console.log(`Uploaded ${file} to ${dest}`);
            }).catch(e => {
                console.log(`Failed to upload file ${file} to ${dest} (${e})`);
                process.exit(1);
            });

            // add tags
            if (tagIds.size) {
                try {
                    // get file id: https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html#requesting-properties
                    let response = await axios.request({
                        method: "propfind",
                        url: `${basePath}/files/${userEnv}/${dest}`,
                        auth: {
                            username: userEnv,
                            password: tokenEnv
                        },
                        data: `<?xml version="1.0"?>
                            <d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
                                <d:prop>
                                    <oc:fileid/>
                                </d:prop>
                            </d:propfind>`
                    });
                    var data = JSON.parse(xml.toJson(response.data));
                    let fileId = data["d:multistatus"]["d:response"]["d:propstat"]["d:prop"]["oc:fileid"];
                    if (!quiet)
                        console.log(`File id of file ${file} is ${fileId}`);

                    // add tags: https://doc.owncloud.com/server/next/developer_manual/webdav_api/tags.html#assign-a-tag-to-a-file
                    for (let [tag, tagId] of tagIds.entries()) {
                        await axios.request({
                            method: "put",
                            url: `${basePath}/systemtags-relations/files/${fileId}/${tagId}`,
                            auth: {
                                username: userEnv,
                                password: tokenEnv
                            },
                            // 409 conflicted means the tag is already applied
                            validateStatus: s => s == 201 || s == 409
                        });
                        if (!quiet)
                            console.log(`Added tag ${tag} to file ${file}`);
                    }

                } catch (error) {
                    console.log(`Failed to assign tags ${tags} to file ${file} (${error})`);
                    process.exit(1);
                }

            }
        }
    }
}
