// api/sheets.js - Vercel Serverless Function with Enhanced Caching
import { google } from 'googleapis';

// In-memory cache with TTL
let cache = {
  allSheets: null,
  sheetData: new Map(),
  stats: null,
  timestamp: null
};

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache (increased from 5)
const RATE_LIMIT_WINDOW = 60000; // 1 minute
let requestCount = 0;
let lastReset = Date.now();

function resetRateLimitIfNeeded() {
  const now = Date.now();
  if (now - lastReset >= RATE_LIMIT_WINDOW) {
    requestCount = 0;
    lastReset = now;
  }
}

function checkRateLimit() {
  resetRateLimitIfNeeded();
  if (requestCount >= 10) { // Max 10 requests per minute
    return false;
  }
  requestCount++;
  return true;
}

function isCacheValid() {
  return cache.timestamp && (Date.now() - cache.timestamp) < CACHE_DURATION;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Rate limiting
  if (!checkRateLimit()) {
    return res.status(429).json({ 
      success: false, 
      error: 'Rate limit exceeded. Please wait a moment.',
      retryAfter: 60
    });
  }
  
  try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.SPREADSHEET_ID;
    
    if (!clientEmail || !privateKey || !spreadsheetId) {
      throw new Error('Missing environment variables');
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Handle GET requests
    if (req.method === 'GET') {
      const { action, sheetName, all } = req.query;
      
      // Get all sheets with data - CHECK CACHE FIRST
      if (all === 'true' || action === 'getAllSheets') {
        if (isCacheValid() && cache.allSheets) {
          console.log('Returning cached all sheets data');
          return res.json({ 
            success: true, 
            sheets: cache.allSheets.data,
            totalSheets: cache.allSheets.totalSheets,
            fromCache: true
          });
        }
        
        console.log('Fetching fresh data from Google Sheets API');
        
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetsList = metadata.data.sheets || [];
        const result = {};
        
        // Process sheets in parallel but with concurrency limit
        const batchSize = 3;
        for (let i = 0; i < sheetsList.length; i += batchSize) {
          const batch = sheetsList.slice(i, i + batchSize);
          await Promise.all(batch.map(async (sheet) => {
            const name = sheet.properties.title;
            try {
              const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${name}'!A1:Z1000`,
              });
              const data = response.data.values || [];
              const headers = data[0] || [];
              const rows = data.slice(1);
              
              result[name] = { headers, data: rows, totalRecords: rows.length };
            } catch (sheetError) {
              console.error(`Error fetching sheet ${name}:`, sheetError.message);
              result[name] = { headers: [], data: [], totalRecords: 0, error: sheetError.message };
            }
          }));
          
          // Add delay between batches
          if (i + batchSize < sheetsList.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        cache.allSheets = {
          data: result,
          totalSheets: sheetsList.length
        };
        cache.timestamp = Date.now();
        
        return res.json({ success: true, sheets: result, totalSheets: sheetsList.length });
      }
      
      // Get specific sheet data - CHECK CACHE FIRST
      if (sheetName) {
        const cachedSheet = cache.sheetData.get(sheetName);
        if (cachedSheet && (Date.now() - cachedSheet.timestamp) < CACHE_DURATION) {
          console.log(`Returning cached data for sheet: ${sheetName}`);
          return res.json({ 
            success: true, 
            sheetName, 
            headers: cachedSheet.headers,
            data: cachedSheet.data,
            totalRecords: cachedSheet.totalRecords,
            fromCache: true
          });
        }
        
        console.log(`Fetching fresh data for sheet: ${sheetName}`);
        
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${sheetName}'!A1:Z1000`,
        });
        const data = response.data.values || [];
        const headers = data[0] || [];
        const rows = data.slice(1);
        
        cache.sheetData.set(sheetName, {
          headers: headers,
          data: rows,
          totalRecords: rows.length,
          timestamp: Date.now()
        });
        
        return res.json({ success: true, sheetName, headers, data: rows, totalRecords: rows.length });
      }
      
      // Get sheet names only - CHECK CACHE FIRST
      if (isCacheValid() && cache.allSheets) {
        const sheetNames = Object.keys(cache.allSheets.data);
        return res.json({ success: true, sheets: sheetNames, fromCache: true });
      }
      
      const metadata = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetNames = (metadata.data.sheets || []).map(s => s.properties.title);
      
      // Cache the sheet names
      if (!cache.allSheets) cache.allSheets = {};
      cache.allSheets.sheetNames = sheetNames;
      cache.timestamp = Date.now();
      
      return res.json({ success: true, sheets: sheetNames });
    }
    
    // Handle POST requests (write operations) - INVALIDATE CACHE
    if (req.method === 'POST') {
      const { action, sheetName, record, rowNumber, records } = req.body;
      
      if (action === 'addRecord') {
        const headersRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${sheetName}'!A1:Z1`,
        });
        const headers = headersRes.data.values?.[0] || [];
        const newRow = headers.map(header => record?.[header] || '');
        
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'${sheetName}'!A1:Z1`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [newRow] },
        });
        
        // Invalidate cache
        cache.sheetData.delete(sheetName);
        cache.allSheets = null;
        cache.stats = null;
        cache.timestamp = null;
        
        return res.json({ success: true, message: 'Record added successfully' });
      }
      
      if (action === 'updateRecord') {
        const headersRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'${sheetName}'!A1:Z1`,
        });
        const headers = headersRes.data.values?.[0] || [];
        
        let updateRow;
        if (Array.isArray(record)) {
          updateRow = record;
        } else {
          updateRow = headers.map(header => record?.[header] || '');
        }
        
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${sheetName}'!A${rowNumber}:Z${rowNumber}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [updateRow] },
        });
        
        // Invalidate cache
        cache.sheetData.delete(sheetName);
        cache.allSheets = null;
        cache.stats = null;
        cache.timestamp = null;
        
        return res.json({ success: true, message: 'Record updated successfully' });
      }
      
      if (action === 'deleteRecord') {
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `'${sheetName}'!A${rowNumber}:Z${rowNumber}`,
        });
        
        // Invalidate cache
        cache.sheetData.delete(sheetName);
        cache.allSheets = null;
        cache.stats = null;
        cache.timestamp = null;
        
        return res.json({ success: true, message: 'Record deleted successfully' });
      }
      
      return res.json({ success: false, error: 'Unknown action' });
    }
    
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    // Return cached data if available when quota exceeded
    if (error.message.includes('Quota exceeded') && cache.allSheets) {
      console.log('Quota exceeded, returning cached data');
      return res.json({ 
        success: true, 
        sheets: cache.allSheets.data,
        totalSheets: cache.allSheets.totalSheets,
        fromCache: true,
        warning: 'Using cached data due to API quota limits'
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
}
