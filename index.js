const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');

// Configure CORS options
const corsOptions = {
  origin: ['http://localhost:3000', 'http://example.com','http://127.0.0.1:5500'], // Hardcoded allowed origins
  methods: ['GET', 'POST'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true // Allow credentials (cookies, authorization headers, etc.)
};


const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize Express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
// app.use(cors());
app.use(cors(corsOptions));


console.log('MinIO Endpoint:', process.env.MINIO_ENDPOINT || 'http://minio.westvalleymontessori.com');
console.log('MinIO Access Key:', process.env.MINIO_ACCESS_KEY)
console.log('MinIO Secret Key:', process.env.MINIO_SECRET_KEY)

// Configure MinIO S3 client
const s3Client = new AWS.S3({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio.westvalleymontessori.com',
  accessKeyId: process.env.MINIO_ACCESS_KEY || 'root',
  secretAccessKey: process.env.MINIO_SECRET_KEY || 'root123!',
  s3ForcePathStyle: true, // Required for MinIO
  signatureVersion: 'v4'
});

// Default bucket name
const defaultBucket = process.env.MINIO_DEFAULT_BUCKET || 'wolvista-files-dev';

// Initialize server
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
});

// API Route for generating presigned URLs
app.post('/api/generate-presigned-url', async (req, res) => {
  try {
    const { file } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided.' });
    }
    
    const allowedFileTypes = {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.svg'],
      'application/zip': ['.zip'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    };
    
    const allExtensions = Object.values(allowedFileTypes).flat();
    const extension = file.substring(file.lastIndexOf('.')).toLowerCase();
    
    if (!allExtensions.includes(extension)) {
      return res.status(400).json({ error: `File type not allowed for file: ${file}` });
    }
    
    // Determine content type
    let contentType;
    for (const [type, extensions] of Object.entries(allowedFileTypes)) {
      if (extensions.includes(extension)) {
        if (type === 'image/*') {
          contentType = `image/${extension.replace('.', '')}`;
        } else {
          contentType = type;
        }
        break;
      }
    }
    
    // Generate a unique file name
    const fileName = `${uuidv4()}${extension}`;
    
    // Generate the presigned URL for uploading (expires in 1 hour)
    const uploadParams = {
      Bucket: defaultBucket,
      Key: fileName,
      ContentType: contentType,
      Expires: 3600 // 1 hour
    };
    
    const uploadUrl = s3Client.getSignedUrl('putObject', uploadParams);
    
    // Generate the direct URL for downloading
    // Note that this will only work if the bucket has public read access
    const endpoint = s3Client.endpoint.href;
    const downloadUrl = `${endpoint}${defaultBucket}/${fileName}`;
    
    res.json({ uploadUrl, downloadUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app; // For testing purposes