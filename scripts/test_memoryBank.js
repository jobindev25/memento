require('dotenv').config({ path: '.env' });
const { fetchPatientContext } = require('../lib/memoryBank');

async function checkGCPFetch() {
  console.log('Testing fetchPatientContext from GCP Storage...');
  try {
    const result = await fetchPatientContext('patient_001');
    console.log('\n--- Result from fetchPatientContext ---');
    console.log(result);
    console.log('---------------------------------------\n');

  } catch (error) {
    console.error('Error testing fetch:', error);
  }
}

checkGCPFetch();
