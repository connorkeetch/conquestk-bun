const axios = require('axios');
const FormData = require('form-data');

async function testMapUpload() {
  const form = new FormData();
  
  // Add the same fields the frontend sends
  form.append('name', 'Test Map');
  form.append('description', 'Map with 6 territories and 1 continents');
  form.append('isPublic', 'true');
  form.append('tags', JSON.stringify(['custom', 'user-created']));
  
  const metadata = {
    territories: [
      { id: 't1', name: 'Territory 1', x: 100, y: 100 },
      { id: 't2', name: 'Territory 2', x: 200, y: 100 },
      { id: 't3', name: 'Territory 3', x: 300, y: 100 },
      { id: 't4', name: 'Territory 4', x: 100, y: 200 },
      { id: 't5', name: 'Territory 5', x: 200, y: 200 },
      { id: 't6', name: 'Territory 6', x: 300, y: 200 },
    ],
    continents: [
      { id: 'c1', name: 'Continent 1', territories: ['t1', 't2', 't3', 't4', 't5', 't6'] }
    ],
    width: 400,
    height: 300
  };
  
  form.append('metadata', JSON.stringify(metadata));
  
  try {
    console.log('Testing map upload with multipart form data...');
    
    // First, let's get a token by logging in
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      email: 'test@example.com', // You'll need valid credentials
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, got token');
    
    // Now test the map upload
    const response = await axios.post('http://localhost:5001/api/maps', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Map upload successful!');
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('❌ Upload failed with status:', error.response.status);
      console.error('Error data:', error.response.data);
      
      if (error.response.data.details) {
        console.error('Validation errors:');
        error.response.data.details.forEach(detail => {
          console.error(`  - ${detail.path}: ${detail.msg}`);
        });
      }
    } else {
      console.error('❌ Request failed:', error.message);
    }
  }
}

// Run the test
testMapUpload();