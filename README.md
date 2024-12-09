# upload-to-google-drive-action
Used for uploading a directory or file to Google Drive. Supports cross-platform.

### Requirements
- **Google Drive Credentials**:
  - [Create Google Service Accounts (GSA)](https://cloud.google.com/iam/docs/service-accounts-create)
  - Navigate to the [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) page, select the account and generate a key.
  - Encode the key in Base64 format and store it in GitHub Secrets.
  - [Enable Google Drive API](https://console.cloud.google.com/apis/api/drive.googleapis.com)
  - Add the GSA's email to the destination folder's access permissions.

### Inputs
- **is_shared_drive (Optional)**: Whether the destination folder is in a shared drive. Defaults to false.
- **auto_delete (Required)**: When the GSA's storage reaches its capacity, files will be automatically deleted, starting with the oldest. Defaults to false.
- **credentials (Optional)**: The credentials for Google Drive authentication in Base64 format.
- **src_path (Required)**: The source path to upload. Can be a file or a directory.
- **dest_folder (Optional)**: The destination folder in Google Drive.
- **dest_file_name**: The destination file name in Google Drive. If not provided, the source file name from src_path will be used.

### Usage
```yaml
- name: Upload to Google Drive
  uses: Wtzd8645/upload-to-google-drive-action@v1
  with:
    credentials: ${{ secrets.GOOGLE_DRIVE_CREDENTIALS }}
    src_path: ${{ github.workspace }}/my-dir
    dest_folder: ${{ vars.GOOGLE_DRIVE_FOLDER }}
```