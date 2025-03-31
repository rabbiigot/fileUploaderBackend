const express = require('express');
const { google } = require('googleapis');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

const port = process.env.PORT || 7000;
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, 
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL}/auth/google/callback`
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

app.use(cors({
  origin: process.env.FRONTEND_URL,  
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true, 
}));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE'); 
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); 
  next(); 
});

app.use(cookieParser());

const upload = multer({ dest: 'uploads/' });

app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', 
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
      return res.status(400).send('No code received from Google');
    }
  
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
  
      res.cookie('access_token', tokens.access_token);
      res.cookie('refresh_token', tokens.refresh_token);
  
      res.redirect(`${process.env.FRONTEND_URL}?authenticated=true`); 
    } catch (error) {
      console.error('Error during OAuth callback:', error);
      res.status(500).send('Error during OAuth callback');
    }
});

app.get('/api/auth/status', (req, res) => {
  if (req.cookies.access_token) {
    res.json({ message: 'Authenticated' });
  } else {
    res.json({ message: 'Not authenticated' });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const authHeader = req.headers['authorization'];
  
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send('Unauthorized: No valid token provided');
    }
  
    const accessToken = authHeader.split(' ')[1];
  
    if (!accessToken) {
      return res.status(401).send('Unauthorized: Access token missing');
    }
  
    oauth2Client.setCredentials({ access_token: accessToken });
  
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }
  
    const filePath = path.join(__dirname, 'uploads', req.file.filename);
  
    const fileMetadata = {
      name: req.file.originalname,
      parents: ['1NBuL0EqpnWwX79odq5X6JOWHDMzvYEZT'], 
    };
  
    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(filePath),
    };
  
    try {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });
  
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
      });
  
      fs.unlinkSync(filePath);
  
      res.status(200).json({
        message: 'File uploaded successfully',
        fileId: response.data.id,
      });
    } catch (error) {
      console.error('Error uploading file to Google Drive:', error);
      res.status(500).send('Error uploading file to Google Drive');
    }
});
  
app.listen(port, () => {
    console.log(`Server running at ${process.env.BASE_URL || `http://localhost:${port}`}`);
});
