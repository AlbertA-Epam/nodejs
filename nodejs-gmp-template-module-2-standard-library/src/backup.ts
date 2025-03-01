/* eslint-disable arrow-body-style */
/* eslint-disable max-len */
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';

const promisifiedExec = promisify(exec); // async version of exec function, should be used to run tar command
const logFilePath: string = 'backup_log.txt'; // the log file where backup hashes are stored, do not change

/**
 * Calculates a SHA-256 checksum for a given string.
 *
 * @param {string} str - The input string from which to generate the checksum (UTF8 encoding).
 * @returns {Promise<string>} A promise that resolves with the calculated checksum (HEX string).
 */
export const calculateDirectoryChecksum = async (str: string): Promise<string> => crypto.createHash('sha256').update(str, 'utf8').digest('hex');

/**
 * Retrieves the most recent backup hash from a log file.
 *
 * @param {string} logPath - Path to the log file containing backup hashes.
 * @returns {Promise<string | null>} A promise that resolves with the last backup hash found,
 *                                   or null if no hash is found or if an error occurs.
 */
export const getLastBackupHash = async (logPath: string): Promise<string | null> => {
  try {
    // Read the log file asynchronously
    const logFileContent = await fs.readFile(logPath, 'utf-8');

    // Split the content by newlines to process each log entry
    const logLines = logFileContent.trim().split('\n');

    // Find the last log entry containing the word 'HASH:' and extract the hash
    const lastHashLine = logLines.reverse().find(line => line.includes('HASH:'));

    if (!lastHashLine) {
      return null; // No hash entry found
    }

    // Extract the hash value after 'HASH:'
    const lastHash = lastHashLine.split('HASH:')[1]?.trim();

    // Return the extracted hash or null if it's not found
    return lastHash ?? null;
  } catch (error) {
    console.error('Error reading log file:', error);
    return null;
  }
};

/**
 * Creates an archive from a specified source directory and stores it in a destination directory.
 * Logs the result to a predetermined log file.
 *
 * @param {string} sourceDir - The directory to archive.
 * @param {string} destinationDir - The directory where the archive is to be stored.
 * @throws {Error} Throws an error if the archive creation fails.
 * @returns {Promise<void>} A promise that resolves when the archive has been successfully created.
 */
export const createArchive = async (sourceDir: string, destinationDir: string): Promise<void> => {
  // **1. Backup Filename**
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `backup-${timestamp}.tar.gz`;
  const backupFilePath = path.join(destinationDir, backupFilename);

  // Normalize paths to use forward slashes (Unix-style)
  const normalizedSourceDir = sourceDir.replace(/\\/g, '/');
  const normalizedBackupFilePath = backupFilePath.replace(/\\/g, '/');

  // **2. Backup Execution**
  try {
    // Execute the tar command to create the backup
    const tarCommand = `tar -czf "${normalizedBackupFilePath}" -C "${normalizedSourceDir}" .`;
    console.log(`Running tar command: ${tarCommand}`); // Log the tar command for debugging

    await promisifiedExec(tarCommand);

    // **3. Checksum and Logging**
    const files = await fs.readdir(sourceDir);
    console.log(`Files in source directory: ${files}`); // Log files for debugging
    const fileContents = await Promise.all(files.map(file => fs.readFile(path.join(sourceDir, file), 'utf8')));
    const checksum = await calculateDirectoryChecksum(fileContents.join(''));

    // Log success message
    const successLog = `${timestamp}: SUCCESS: Backup created at ${normalizedBackupFilePath}, HASH: ${checksum}\n`;
    console.log(`Writing success log: ${successLog}`); // Log the success log for debugging
    await fs.appendFile(logFilePath, successLog);
  } catch (error: any) {
    const failedLog = `${new Date().toISOString()}: FAILED: ${error.message}\n`;
    console.error(`Error occurred: ${error.message}`); // Log the error for debugging
    await fs.appendFile(logFilePath, failedLog);
    throw new Error(`Failed to create backup, error = ${error.message}`);
  }
};

/**
 * Executes the backup process by checking the checksum of the current directory against the last backup.
 * If the checksums differ, it proceeds to create a new archive; otherwise, it skips the backup process.
 *
 * @param {string} sourceDir - The source directory to check for changes.
 * @param {string} destinationDir - The destination directory for storing the backup archive.
 * @throws {Error} Throws an error if the directory creation or any part of the backup process fails.
 * @returns {Promise<void>} A promise that resolves when the backup process has completed,
 *                          either by creating a new backup or skipping the process.
 */
export const runBackup = async (sourceDir: string, destinationDir: string): Promise<void> => {
  try {
    // 1. **Directory Content Retrieval:**
    const files = await fs.readdir(sourceDir);

    // 2. **Checksum Calculation:**
    const newChecksum = await calculateDirectoryChecksum(files.join(''));

    // 3. **Checksum Verification:**
    const lastChecksum = await getLastBackupHash(logFilePath);

    // 4. **Backup Decision:**
    if (lastChecksum === newChecksum) {
      console.log('No changes detected since last backup');
      return; // Skip backup if checksums are the same
    }

    // 5. **Ensure Destination Directory Exists:**
    await fs.mkdir(destinationDir, { recursive: true });

    // 6. **Proceed with Backup:**
    await createArchive(sourceDir, destinationDir);
  } catch (error: any) {
    // 7. **Error Handling:**
    console.error(`Error occurred during backup: ${error.message}`);
    process.stderr.write(`Error occurred during backup: ${error.message}\n`);
  }
};