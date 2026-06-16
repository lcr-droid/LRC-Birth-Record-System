// server.js
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Cache configuration
let cache = {
  allSheets: null,
  sheetData: new Map(),
  stats: null,
  timestamp: null
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Validate environment variables
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

console.log('Environment check:', {
  hasClientEmail: !!GOOGLE_CLIENT_EMAIL,
  hasPrivateKey: !!GOOGLE_PRIVATE_KEY,
  hasSpreadsheetId: !!SPREADSHEET_ID,
});

// Helper to get auth client
async function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_CLIENT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function cleanSheetName(name) {
  // Remove extra spaces and trim
  let cleaned = name.trim();
  // Remove multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned;
}

// Helper to check if cache is valid
function isCacheValid() {
  return cache.timestamp && (Date.now() - cache.timestamp) < CACHE_DURATION;
}

// GET /api/sheets - Get all sheet names (cached)
app.get('/api/sheets', async (req, res) => {
  try {
    // Check cache first
    if (isCacheValid() && cache.allSheets) {
      console.log('Returning cached sheet names');
      return res.json({ success: true, sheets: cache.allSheets.sheetNames });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const sheetNames = (metadata.data.sheets || []).map(s => cleanSheetName(s.properties.title));
    
    // Update cache
    if (!cache.allSheets) cache.allSheets = {};
    cache.allSheets.sheetNames = sheetNames;
    cache.timestamp = Date.now();
    
    res.json({ success: true, sheets: sheetNames });
  } catch (error) {
    console.error('Error getting sheet names:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sheets/all - Get all sheets with data (cached)
app.get('/api/sheets/all', async (req, res) => {
  try {
    // Check cache first
    if (isCacheValid() && cache.allSheets && cache.allSheets.data) {
      console.log('Returning cached all sheets data');
      return res.json({
        success: true,
        sheets: cache.allSheets.data,
        totalSheets: cache.allSheets.totalSheets,
        fromCache: true
      });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const sheetsList = metadata.data.sheets || [];
    const result = {};
    
    // Process sheets one by one with delays to avoid quota issues
    for (let i = 0; i < sheetsList.length; i++) {
      const sheet = sheetsList[i];
      const rawSheetName = sheet.properties.title;
      const sheetName = cleanSheetName(rawSheetName);
      
      console.log(`Fetching data from: ${sheetName} (${i + 1}/${sheetsList.length})`);
      
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${sheetName}'!A1:Z1000`,
        });
        
        const data = response.data.values || [];
        const headers = data[0] || [];
        const rows = data.slice(1);
        
        result[sheetName] = {
          headers: headers,
          data: rows,
          totalRecords: rows.length,
        };
      } catch (sheetError) {
        console.error(`Error fetching sheet ${sheetName}:`, sheetError.message);
        result[sheetName] = {
          headers: [],
          data: [],
          totalRecords: 0,
          error: sheetError.message
        };
      }
      
      // Add delay between requests to avoid quota issues
      if (i < sheetsList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Update cache
    cache.allSheets = {
      data: result,
      totalSheets: sheetsList.length,
      sheetNames: Object.keys(result)
    };
    cache.timestamp = Date.now();
    
    res.json({
      success: true,
      sheets: result,
      totalSheets: sheetsList.length,
    });
  } catch (error) {
    console.error('Error getting all sheets:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sheets/data - Get specific sheet data (cached per sheet)
app.get('/api/sheets/data', async (req, res) => {
  try {
    let sheetName = req.query.sheetName;
    if (!sheetName) {
      return res.status(400).json({ success: false, error: 'sheetName is required' });
    }
    
    sheetName = cleanSheetName(sheetName);
    
    // Check cache for this specific sheet
    const cachedSheet = cache.sheetData.get(sheetName);
    if (cachedSheet && (Date.now() - cachedSheet.timestamp) < CACHE_DURATION) {
      console.log(`Returning cached data for sheet: ${sheetName}`);
      return res.json({
        success: true,
        sheetName: sheetName,
        headers: cachedSheet.headers,
        data: cachedSheet.data,
        totalRecords: cachedSheet.totalRecords,
        fromCache: true
      });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log(`Fetching data from sheet: ${sheetName}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:Z1000`,
    });
    
    const data = response.data.values || [];
    const headers = data[0] || [];
    const rows = data.slice(1);
    
    // Cache the sheet data
    cache.sheetData.set(sheetName, {
      headers: headers,
      data: rows,
      totalRecords: rows.length,
      timestamp: Date.now()
    });
    
    res.json({
      success: true,
      sheetName: sheetName,
      headers: headers,
      data: rows,
      totalRecords: rows.length,
    });
  } catch (error) {
    console.error('Error getting sheet data:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sheets/stats - Get statistics (cached)
app.get('/api/sheets/stats', async (req, res) => {
  try {
    // Check cache first
    if (isCacheValid() && cache.stats) {
      console.log('Returning cached stats');
      return res.json({ success: true, ...cache.stats, fromCache: true });
    }
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    const sheetsList = metadata.data.sheets || [];
    let totalRecords = 0;
    const sheetStats = [];
    
    // In the getAllSheetsData function or /all endpoint
    for (let i = 0; i < sheetsList.length; i++) {
    const sheet = sheetsList[i];
    let sheetName = sheet.properties.title;
    
    // Clean the sheet name
    const originalName = sheetName;
    sheetName = cleanSheetName(sheetName);
    
    console.log(`Fetching data from: "${originalName}" -> "${sheetName}"`);
    
    try {
        const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A1:Z1000`,
        });
        
        const data = response.data.values || [];
        const headers = data[0] || [];
        const rows = data.slice(1);
        
        // Store with original name for consistency
        result[originalName] = {
        headers: headers,
        data: rows,
        totalRecords: rows.length,
        };
    } catch (sheetError) {
        console.error(`Error fetching sheet "${originalName}":`, sheetError.message);
        result[originalName] = {
        headers: [],
        data: [],
        totalRecords: 0,
        error: sheetError.message
        };
    }
    
    // Add delay to avoid quota issues
    if (i < sheetsList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    }
    
    cache.stats = {
      totalSheets: sheetsList.length,
      totalRecords: totalRecords,
      sheets: sheetStats,
    };
    cache.timestamp = Date.now();
    
    res.json({
      success: true,
      totalSheets: sheetsList.length,
      totalRecords: totalRecords,
      sheets: sheetStats,
    });
  } catch (error) {
    console.error('Error getting stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sheets/add - Add a new record (invalidates cache)
app.post('/api/sheets/add', async (req, res) => {
  try {
    let { sheetName, record } = req.body;
    
    if (!sheetName || !record) {
      return res.status(400).json({ success: false, error: 'sheetName and record are required' });
    }
    
    sheetName = cleanSheetName(sheetName);
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Get headers
    const headersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:Z1`,
    });
    
    const headers = headersRes.data.values?.[0] || [];
    const newRow = headers.map(header => record[header] || '');
    
    // Append row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:Z1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [newRow] },
    });
    
    // Invalidate cache for this sheet
    cache.sheetData.delete(sheetName);
    cache.allSheets = null;
    cache.stats = null;
    cache.timestamp = null;
    
    res.json({ success: true, message: 'Record added successfully' });
  } catch (error) {
    console.error('Error adding record:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sheets/update - Update a record (invalidates cache)
app.post('/api/sheets/update', async (req, res) => {
  try {
    let { sheetName, rowNumber, record } = req.body;
    
    if (!sheetName || !rowNumber || !record) {
      return res.status(400).json({ success: false, error: 'sheetName, rowNumber, and record are required' });
    }
    
    sheetName = cleanSheetName(sheetName);
    
    console.log(`Updating record in sheet: ${sheetName}, row: ${rowNumber}`);
    console.log('Record data:', record);
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Get headers to know the column structure
    const headersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:Z1`,
    });
    
    const headers = headersRes.data.values?.[0] || [];
    console.log('Headers:', headers);
    
    // Build the row data based on headers
    const updateRow = [];
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      // Find the value in the record object
      let value = record[header];
      if (value === undefined) {
        // If record is an array, use index
        value = record[i] || '';
      }
      updateRow.push(value);
    }
    
    console.log(`Updating row ${rowNumber} with:`, updateRow);
    
    // Update the specific row
    const range = `'${sheetName}'!A${rowNumber}:Z${rowNumber}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [updateRow]
      }
    });
    
    console.log(`Successfully updated row ${rowNumber} in ${sheetName}`);
    
    // Invalidate cache for this sheet
    cache.sheetData.delete(sheetName);
    cache.allSheets = null;
    cache.stats = null;
    cache.timestamp = null;
    
    res.json({ success: true, message: 'Record updated successfully' });
  } catch (error) {
    console.error('Error updating record:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sheets/delete - Delete a record (invalidates cache)
app.post('/api/sheets/delete', async (req, res) => {
  try {
    let { sheetName, rowNumber } = req.body;
    
    if (!sheetName || !rowNumber) {
      return res.status(400).json({ success: false, error: 'sheetName and rowNumber are required' });
    }
    
    sheetName = cleanSheetName(sheetName);
    
    console.log(`Deleting record from sheet: ${sheetName}, row: ${rowNumber}`);
    
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Get the current row data to verify it exists
    const getRow = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A${rowNumber}:Z${rowNumber}`,
    });
    
    if (!getRow.data.values || getRow.data.values.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    
    // Clear the row (set all cells to empty)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A${rowNumber}:Z${rowNumber}`,
    });
    
    console.log(`Successfully deleted row ${rowNumber} from ${sheetName}`);
    
    // Invalidate cache for this sheet
    cache.sheetData.delete(sheetName);
    cache.allSheets = null;
    cache.stats = null;
    cache.timestamp = null;
    
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ API server running on http://localhost:${PORT}`);
});
