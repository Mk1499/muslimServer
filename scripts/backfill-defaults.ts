/**
 * Backfills the fields added to the existing collections with their schema
 * defaults. Mongoose only applies a `default` to documents it creates, so
 * documents that predate a field have no value for it — which makes the API
 * omit the key (legacy speakers answered with no `views` at all).
 *
 * The script is idempotent: it only writes fields that are missing, and it
 * never touches a field that already holds a value.
 *
 * Run it with:
 *   npx ts-node scripts/backfill-defaults.ts
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

config();

/** Field -> default, per collection. */
const BACKFILL: Record<string, Record<string, unknown>> = {
  speakers: {
    nameAr: '',
    nameEn: '',
    bioAr: '',
    bioEn: '',
    instagramProfileUrl: '',
    tiktokProfileUrl: '',
    facebookProfileUrl: '',
    youtubeProfileUrl: '',
    views: 0,
    publishedVideosCount: 0,
  },
  videos: {
    views: 0,
    duration: 0,
  },
  categories: {
    nameAr: '',
    nameEn: '',
  },
};

async function backfill(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No database connection');
  }

  for (const [collection, fields] of Object.entries(BACKFILL)) {
    // Only documents that are missing the field are touched.
    const filter = {
      $or: Object.keys(fields).map((field) => ({
        [field]: { $exists: false },
      })),
    };
    const update = { $set: fields };

    const result = await db.collection(collection).updateMany(filter, update);
    console.log(
      `${collection}: ${result.modifiedCount} document(s) backfilled`,
    );
  }

  await mongoose.disconnect();
}

backfill().catch((error) => {
  console.error(error);
  process.exit(1);
});
