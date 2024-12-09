import { createReadStream, createWriteStream, lstatSync, promises } from 'fs';
import { google } from 'googleapis';
import { basename, dirname, extname, join } from 'path';
import archiver from 'archiver';

const credentials = process.env.credentials;
const srcPath = process.env.src_path;
const destFolder = process.env.dest_folder;
const destFileName = process.env.dest_file_name;

async function main() {
  const credentialsJson = JSON.parse(Buffer.from(credentials, 'base64').toString());
  const scopes = ['https://www.googleapis.com/auth/drive'];
  const auth = new google.auth.JWT(credentialsJson.client_email, null, credentialsJson.private_key, scopes);
  const drive = google.drive({ version: 'v3', auth });

  let fileName;
  let filePath;
  let isCompressed = false;
  try {
    if (lstatSync(srcPath).isDirectory()) {
      fileName = `${destFileName || basename(srcPath)}.zip`
      filePath = join(dirname(srcPath), `${fileName}`);
      await compressFile(srcPath, filePath);
      isCompressed = true;
    }
    else {
      const ext = extname(srcPath);
      fileName = `${destFileName || basename(srcPath, ext)}${ext}`;
      filePath = srcPath;
    }

    const fileSize = lstatSync(filePath).size;
    await ensureSpace(drive, credentialsJson, fileSize);
    await uploadFile(drive, filePath, fileName);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  } finally {
    if (isCompressed && filePath) {
      try {
        console.log(`Deleting compressed file: ${filePath}`);
        await promises.unlink(filePath);
      } catch (error) {
        console.error(`Failed to delete compressed file: ${error.message}`);
      }
    }
  }
}

function compressFile(src, dest) {
  console.log(`Compressing file. Source: ${src}, Destination: ${dest}`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = createWriteStream(dest);
  return new Promise((resolve, reject) => {
    archive.on('end', () => console.log('Compression completed.'));
    archive.on('error', err => reject(err));
    stream.on('close', resolve);
    stream.on('error', err => reject(err));

    archive.directory(src, false);
    archive.pipe(stream);
    archive.finalize();
  });
}

async function ensureSpace(drive, credentialsJson, size) {
  const { data } = await drive.about.get({ fields: 'storageQuota' });
  const limit = parseInt(data.storageQuota.limit) || Number.MAX_SAFE_INTEGER;
  const usage = parseInt(data.storageQuota.usage);
  let files = [];
  let space = limit - usage;
  console.log(`Ensuring space. Free space: ${space}, Required space: ${size}`);
  while (space < size) {
    files = await listFiles(drive, credentialsJson);
    if (files.length === 0) {
      break;
    }

    for (const file of files) {
      console.log(`Deleting file. Id: ${file.id}, Name: ${file.name}, Size: ${file.size}`);
      await drive.files.delete({ fileId: file.id });

      space += parseInt(file.size);
      if (space >= size) {
        break;
      }
    }
  }
}

async function listFiles(drive, credentialsJson) {
  const { data } = await drive.files.list({
    q: `"${credentialsJson.client_email}" in owners and trashed = false`,
    fields: 'files(id, name, size)',
    orderBy: 'createdTime asc',
    pageSize: 1000,
  });
  return data.files;
}

async function uploadFile(drive, filePath, fileName) {
  console.log(`Uploading file. FilePath: ${filePath}, Destination: ${destFolder}`);
  const fileStream = createReadStream(filePath);
  await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [destFolder]
    },
    media: {
      body: fileStream
    },
  });
}

main();