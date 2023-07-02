# Nextcloud Upload
Simple plugin to upload files to Nextcloud using chunking, based on a glob pattern and a destination location. Note that, since this uses Nextcloud's built-in chunking system, it likely doesn't work for other WebDAV applications.

Here's an example of how to use it:
```yml
steps:
  upload:
    image: ellpeck/woodpecker-nextcloud-upload
    settings:
      server: https://cloud.ellpeck.de # the server to use
      user: EllBot # the user
      token: access-token # the access token, or password if 2FA is disabled
      files: "**/*.md" # the file(s), uses glob pattern
      dest: Uploads/CoolMarkdownFiles # the destination directory
      basedir: "." # optional, local base directory for files, defaults to .
      chunksize: # optional, chunk size in bytes, defaults to 52428800
      quiet: false # optional, whether to reduce output
```
