require('dotenv').config({ path: '.env' });
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');

async function initializeBucket() {
  const bucketName = process.env.GCP_BUCKET_NAME || 'memento-patient-profiles';
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!keyFilename || keyFilename === 'your-service-account-key.json') {
    console.error("Please provide a valid GOOGLE_APPLICATION_CREDENTIALS in .env");
    return;
  }

  const storage = new Storage({ keyFilename: path.resolve(process.cwd(), keyFilename) });
  
  // To avoid naming conflicts, we will append a random string to the bucket name
  // if you want a globally unique one, but let's try the .env one first.
  let actualBucketName = bucketName;
  
  // Check if bucket exists, if not, create it
  try {
    const bucket = storage.bucket(actualBucketName);
    const [exists] = await bucket.exists();
    
    if (!exists) {
      console.log(`Bucket ${actualBucketName} does not exist. Creating it...`);
      // Use a globally unique name by appending timestamp to avoid conflicts
      actualBucketName = `memento-patient-profiles-${Date.now()}`;
      await storage.createBucket(actualBucketName, {
        location: 'US',
      });
      console.log(`Bucket ${actualBucketName} created successfully.`);
    } else {
      console.log(`Bucket ${actualBucketName} already exists.`);
    }

    // Now upload patient_001.json
    console.log(`Uploading patient_001.json to ${actualBucketName}...`);
    await storage.bucket(actualBucketName).upload(path.resolve(process.cwd(), 'patient_001.json'), {
      destination: 'patient_001.json',
    });
    console.log(`patient_001.json uploaded successfully!`);

    // Output the instructions
    console.log(`\n\nSUCCESS! Update your .env file with the actual bucket name used:`);
    console.log(`GCP_BUCKET_NAME=${actualBucketName}\n\n`);

  } catch (error) {
    if (error.code === 409) {
      console.log(`Bucket name ${actualBucketName} is taken globally. Retrying with a unique name...`);
      actualBucketName = `memento-[random-${Date.now()}]`;
      const uniqueBucketName = `memento-patients-${Date.now()}`;
      console.log(`Creating bucket ${uniqueBucketName}...`);
      await storage.createBucket(uniqueBucketName, { location: 'US' });
      console.log(`Bucket ${uniqueBucketName} created successfully.`);
      
      console.log(`Uploading patient_001.json to ${uniqueBucketName}...`);
      await storage.bucket(uniqueBucketName).upload(path.resolve(process.cwd(), 'patient_001.json'), {
        destination: 'patient_001.json',
      });
      console.log(`patient_001.json uploaded successfully!`);

      // Output the instructions
      console.log(`\n\nSUCCESS! Update your .env file with the actual bucket name used:`);
      console.log(`GCP_BUCKET_NAME=${uniqueBucketName}\n\n`);
    } else {
      console.error("Error setting up bucket:", error);
    }
  }
}

initializeBucket();
