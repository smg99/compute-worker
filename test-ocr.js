const fs = require('fs');
async function test() {
  const formData = new FormData();
  formData.append('apikey', 'K84000305088957');
  
  // Create a 1x1 png base64
  formData.append('base64Image', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  
  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData
  });
  console.log(res.status);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();
