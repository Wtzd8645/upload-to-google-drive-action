import { createReadStream, createWriteStream, lstatSync } from 'fs';
import { google } from 'googleapis';
import { basename, dirname, extname, join } from 'path';
import archiver from 'archiver';

const credentials = process.env.credentials;
const srcPath = process.env.src_path;
const destFolder = process.env.dest_folder;
const destFileName = process.env.dest_file_name;

const credentialsJson = JSON.parse(Buffer.from(credentials, 'base64').toString());
const scopes = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.JWT(credentialsJson.client_email, null, credentialsJson.private_key, scopes);
const googleDriveClient = google.drive({ version: 'v3', auth });

async function main() {
  try {
    if (lstatSync(srcPath).isDirectory()) {
      const fileName = `${destFileName || basename(srcPath)}.zip`
      const filePath = join(dirname(srcPath), `${fileName}`);
      await compress(srcPath, filePath);
      await uploadFile(filePath, fileName);
    }
    else {
      const ext = extname(srcPath);
      const fileName = `${destFileName || basename(srcPath, ext)}${ext}`;
      await uploadFile(srcPath, fileName);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

function compress(sourcePath, outputPath) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    stream.on('close', resolve);
    archive.on('error', err => reject(err));
    stream.on('error', err => reject(err));

    archive.directory(sourcePath, false);
    archive.pipe(stream);
    archive.finalize();
  });
}

async function uploadFile(filePath, fileName) {
  const fileStream = createReadStream(filePath);
  await googleDriveClient.files.create({
    requestBody: {
      name: fileName,
      parents: [destFolder]
    },
    media: {
      body: fileStream
    }
  });
}

main();