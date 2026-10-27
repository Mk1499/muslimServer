/**
 * Recomputes `speakers.publishedVideosCount` from the videos collection.
 *
 * The field is maintained by the publish/archive/delete endpoints, but it did
 * not exist before, so this script seeds it once (and can be re-run at any
 * time to repair drift). It is idempotent: every speaker is set to the exact
 * number of published videos it is credited on.
 *
 * Run it with:
 *   npx ts-node scripts/backfill-speaker-published-counts.ts
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

config();

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

  const counts = await db
    .collection('videos')
    .aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { status: 'published' } },
      { $unwind: '$speakers' },
      { $group: { _id: '$speakers', count: { $sum: 1 } } },
    ])
    .toArray();

  // Reset first so speakers that no longer have published videos drop to 0.
  const reset = await db
    .collection('speakers')
    .updateMany({}, { $set: { publishedVideosCount: 0 } });

  if (counts.length > 0) {
    await db.collection('speakers').bulkWrite(
      counts.map(({ _id, count }) => ({
        updateOne: {
          filter: { _id },
          update: { $set: { publishedVideosCount: count } },
        },
      })),
    );
  }

  console.log(
    `speakers: ${reset.matchedCount} document(s) recounted, ` +
      `${counts.length} with published videos`,
  );

  await mongoose.disconnect();
}

backfill().catch((error) => {
  console.error(error);
  process.exit(1);
});
