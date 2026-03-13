require('dotenv').config({ path: '.env' });
const { Storage } = require('@google-cloud/storage');
const path = require('path');

async function listBuckets() {
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const storage = new Storage({ keyFilename: path.resolve(process.cwd(), keyFilename) });
  try {
    const [buckets] = await storage.getBuckets();
    console.log('Buckets:');
    buckets.forEach(bucket => {
      console.log(bucket.name);
    });
  } catch (err) {
    console.error('ERROR:', err);
  }
}
listBuckets();
