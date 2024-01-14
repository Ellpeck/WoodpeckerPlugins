---
name: Nextcloud Upload
author: Ellpeck
description: Upload files to Nextcloud using chunking and optionally add tags to files
tags: [deploy, publish]
containerImage: ellpeck/woodpecker-nextcloud-upload
containerImageUrl: https://hub.docker.com/r/ellpeck/woodpecker-nextcloud-upload
url: https://github.com/Ellpeck/WoodpeckerPlugins/tree/main/nextcloud-upload
---

# Nextcloud Upload
Simple plugin to upload files to Nextcloud using chunking, based on a glob pattern and a destination location. Note that, since this uses Nextcloud's built-in chunking system, it likely doesn't work for other WebDAV applications.

Here's an example of how to use it:
```yml
steps:
  upload:
    image: ellpeck/woodpecker-nextcloud-upload
    settings:
      # required settings
      server: https://cloud.ellpeck.de # the server to use
      user: EllBot # the user
      token: access-token # the access token, or password if 2FA is disabled
      files: # the file(s), uses glob patterns
        - "**/*.md"
      dest: Uploads/CoolMarkdownFiles # the destination directory

      # optional retention settings, useful if old builds should be deleted automatically
      retentionamount: 7 # amount of children that retentionbase is allowed to have before oldest ones are deleted on upload
      retentionbase: Uploads # directory that the retentionamount applies to
      retentionskiptrash: false # whether retention-based deletion should skip the Nextcloud trash, defaults to false

      # misc optional settings
      basedir: "." # local base directory for files, defaults to .
      chunksize: # chunk size in bytes, defaults to 10485760, or 10 MiB
      quiet: false # whether to reduce output, defaults to false
      tags: # a set of tags to apply to uploaded files, tag is expected to already exist
        - mytag
      flatten: false # whether to flatten directories, causing all files to be placed directly in dest, defaults to false
```
