import { createReadStream, createWriteStream, lstatSync, PathLike, promises } from 'fs';
import { drive_v3, google } from 'googleapis';
import { basename, dirname, extname, join } from 'path';
import archiver from 'archiver';

const autoDelete: boolean = process.env.auto_delete === 'true';
const isSharedDrive: boolean = process.env.is_shared_drive === 'true';
const credentials: string = process.env.credentials ?? '';
const srcPath: string = process.env.src_path ?? '';
const destFolder: string = process.env.dest_folder ?? '';
const destFileName: string = process.env.dest_file_name ?? '';

async function main() {
  const credentialsJson = JSON.parse(Buffer.from(credentials, 'base64').toString());
  const scopes: string[] = ['https://www.googleapis.com/auth/drive'];
  const auth = new google.auth.JWT(credentialsJson.client_email, undefined, credentialsJson.private_key, scopes);
  const drive: drive_v3.Drive = google.drive({ version: 'v3', auth });

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

    if (autoDelete) {
      const fileSize = lstatSync(filePath).size;
      await ensureSpace(drive, credentialsJson, fileSize);
    }

    await uploadFile(drive, filePath, fileName);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Unknown error: ${JSON.stringify(error)}`);
    }
    process.exit(1);
  } finally {
    if (isCompressed && filePath) {
      try {
        console.log(`Deleting compressed file: ${filePath}`);
        await promises.unlink(filePath);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Failed to delete compressed file: ${error.message}`);
        } else {
          console.error(`Failed to delete compressed file: ${JSON.stringify(error)}`);
        }
      }
    }
  }
}

function compressFile(src: string, dest: PathLike) {
  console.log(`Compressing file. Source: ${src}, Destination: ${dest}`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = createWriteStream(dest);
  return new Promise((resolve, reject) => {
    archive.on('end', () => console.log('Compression completed.'));
    archive.on('error', (err: any) => reject(err));
    stream.on('close', resolve);
    stream.on('error', err => reject(err));

    archive.directory(src, false);
    archive.pipe(stream);
    archive.finalize();
  });
}

async function ensureSpace(drive: drive_v3.Drive, credentialsJson: any, size: number) {
  const { data } = await drive.about.get({ fields: 'storageQuota' });
  const limit = parseInt(data.storageQuota?.limit ?? '0') || Number.MAX_SAFE_INTEGER;
  const usage = parseInt(data.storageQuota?.usage ?? '0');
  let space: number = limit - usage;
  console.log(`Ensuring space. Free space: ${space}, Required space: ${size}`);
  while (space < size) {
    let files: drive_v3.Schema$File[] = await listFiles(drive, credentialsJson) ?? [];
    if (files.length === 0) {
      break;
    }

    for (const file of files) {
      if (file.id) {
        console.log(`Deleting file. Id: ${file.id}, Name: ${file.name}, Size: ${file.size}`);
        await drive.files.delete({ fileId: file.id });
      }

      space += parseInt(file.size ?? '0');
      if (space >= size) {
        break;
      }
    }
  }
}

async function listFiles(drive: drive_v3.Drive, credentialsJson: any) {
  const { data } = await drive.files.list({
    q: `"${credentialsJson.client_email}" in owners and trashed = false`,
    fields: 'files(id, name, size)',
    orderBy: 'createdTime asc',
    pageSize: 1000,
  });
  return data.files;
}

async function uploadFile(drive: drive_v3.Drive, filePath: PathLike, fileName: string) {
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
    supportsAllDrives: isSharedDrive
  });
}

main();