require('dotenv').config({ path: '.env' });
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

async function listBuckets() {
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const storage = new Storage({ keyFilename: path.resolve(process.cwd(), keyFilename) });
  try {
    const [buckets] = await storage.getBuckets();
    const names = buckets.map(b => b.name).join('\n');
    fs.writeFileSync('buckets.txt', names);
    console.log('Saved to buckets.txt');
  } catch (err) {
    fs.writeFileSync('buckets.txt', 'ERROR: ' + err.message);
  }
}
listBuckets();
