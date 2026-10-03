import path from 'path';

/** Own settings (read from the environment) so the module does not touch the shared config */
export const archiveConfig = {
  dir: path.resolve(process.env.ARCHIVE_DIR ?? 'archive'),
  maxMb: Number(process.env.ARCHIVE_MAX_MB) > 0 ? Number(process.env.ARCHIVE_MAX_MB) : 50,
};
