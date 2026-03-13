require('dotenv').config({ path: '.env' });
const { Storage } = require('@google-cloud/storage');
const path = require('path');

async function createUniqueBucket() {
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const storage = new Storage({ keyFilename: path.resolve(process.cwd(), keyFilename) });
  
  // Create a completely unique name using the timestamp
  const uniqueBucketName = `memento-test-bucket-${Date.now()}`;
  
  try {
    console.log(`Attempting to create a NEW bucket: ${uniqueBucketName}`);
    
    await storage.createBucket(uniqueBucketName, {
      location: 'US',
    });
    
    console.log(`\nSUCCESS! Bucket created automatically by the service account!`);
    console.log(`Name: ${uniqueBucketName}`);
    console.log(`You can verify this by refreshing your GCP Cloud Storage Console.\n`);
    
  } catch (error) {
    console.error("\nFAILED to create the bucket:");
    console.error(error.message);
  }
}

createUniqueBucket();
