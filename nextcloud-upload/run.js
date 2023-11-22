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
const quiet = process.env.PLUGIN_QUIET == "true";
const tags = process.env.PLUGIN_TAGS || "";
const flatten = process.env.PLUGIN_FLATTEN == "true";
const retentionBase = process.env.PLUGIN_RETENTIONBASE || "";
const retentionAmount = process.env.PLUGIN_RETENTIONAMOUNT || 0;
const retentionSkipTrash = process.env.PLUGIN_RETENTIONSKIPTRASH == "true";

upload();

async function upload() {
    let basePath = `${serverEnv}/remote.php/dav`;

    // delete files or directories that exceed the retention amount
    if (retentionBase && retentionAmount) {
        try {
            let retentionPath = `${basePath}/files/${userEnv}/${retentionBase}`;
            let response = await axios.request({
                method: "propfind",
                url: retentionPath,
                auth: {
                    username: userEnv,
                    password: tokenEnv
                },
                // 404 means the directory doesn't exist, which is fine
                validateStatus: s => s == 207 || s == 404
            });
            if (response.status != 404) {
                let data = JSON.parse(xml.toJson(response.data));
                let dirs = data["d:multistatus"]["d:response"]?.slice?.(1) || [];
                // sort directories by last modified
                dirs.sort((a, b) => new Date(a["d:propstat"]["d:prop"]["d:getlastmodified"]) - new Date(b["d:propstat"]["d:prop"]["d:getlastmodified"]));
                while (dirs.length >= parseInt(retentionAmount)) {
                    let dir = serverEnv + dirs[0]["d:href"];
                    let dirName = dir.substring(retentionPath.length - retentionBase.length).replace(/\/$/, "");
                    await axios.request({
                        method: "delete",
                        url: dir,
                        auth: {
                            username: userEnv,
                            password: tokenEnv
                        }
                    });

                    // if we skip the trash, we actually also have to delete the item from the trash
                    if (retentionSkipTrash) {
                        let trashResponse = await axios.request({
                            method: "propfind",
                            url: `${basePath}/trashbin/${userEnv}/trash`,
                            auth: {
                                username: userEnv,
                                password: tokenEnv
                            },
                            data: `<?xml version="1.0"?>
                                <d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
                                    <d:prop>
                                        <nc:trashbin-original-location/>
                                    </d:prop>
                                </d:propfind>`
                        });
                        let trashContent = JSON.parse(xml.toJson(trashResponse.data))["d:multistatus"]["d:response"];
                        let trashItem = trashContent.find(e => e["d:propstat"]["d:prop"]["nc:trashbin-original-location"] == dirName);
                        await axios.request({
                            method: "delete",
                            url: serverEnv + trashItem["d:href"],
                            auth: {
                                username: userEnv,
                                password: tokenEnv
                            }
                        });
                    }

                    console.log(`Deleted directory ${dirName} because retention amount of ${retentionAmount} was reached${retentionSkipTrash ? " (skipped trash)" : ""}`);
                    dirs.splice(0, 1);
                }
            }
        } catch (e) {
            console.log(`Failed to delete old directories (${e})`);
            process.exit(1);
        }
    }

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
        let data = JSON.parse(xml.toJson(response.data))["d:multistatus"]["d:response"].map(e => e["d:propstat"]["d:prop"]);
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
            file = file.replaceAll("\\", "/");
            let fileName = file.split("/").pop();
            let dest = `${destEnv}/${flatten ? fileName : file}`;
            // use lib to upload file
            if (!quiet)
                console.log(`Uploading ${fileName} to ${dest}`);
            await upload.uploadFile(`${baseDir}/${file}`, dest, parseInt(chunkSizeEnv), 5, true).then(() => {
                if (!quiet)
                    console.log(`Uploaded ${fileName} to ${dest}`);
            }).catch(e => {
                console.log(`Failed to upload ${fileName} to ${dest} (${e})`);
                process.exit(1);
            });

            // add tags
            if (tagIds.size)
                await addTags(basePath, tagIds, fileName, dest);
        }
    }
}

async function addTags(basePath, tagIds, fileName, location) {
    try {
        // get file id: https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html#requesting-properties
        let response = await axios.request({
            method: "propfind",
            url: `${basePath}/files/${userEnv}/${location}`,
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
        let data = JSON.parse(xml.toJson(response.data));
        let fileId = data["d:multistatus"]["d:response"]["d:propstat"]["d:prop"]["oc:fileid"];
        if (!quiet)
            console.log(`File id of ${fileName} is ${fileId}`);

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
                console.log(`Added tag ${tag} to ${fileName}`);
        }

    } catch (error) {
        console.log(`Failed to assign tags ${tags} to ${fileName} (${error})`);
        process.exit(1);
    }
}
